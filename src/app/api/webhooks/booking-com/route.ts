import { NextResponse } from "next/server";
import { BookingEventType, BookingStatus, ChannelType } from "@prisma/client";
import { createBooking } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { logWebhook } from "@/lib/webhook-log";
import { secureCompare } from "@/lib/secure-compare";

export const runtime = "nodejs";

/**
 * Booking.com inbound webhook.
 *
 * Accepts two payload shapes:
 *
 *   1. **JSON** — `{ action, reservationId, guest, roomTypeName, ... }`
 *      Used by tests + first-party integrations. `action` = `created` |
 *      `modified` | `cancelled` (defaults to `created` for backwards compat).
 *
 *   2. **XML (BUI / OpenTravel-style)** — Booking.com's real format.
 *      We parse a minimal subset: `<Reservation id status>`, `<Guest>`,
 *      `<RoomType name>`, `<CheckIn>`, `<CheckOut>`, `<Total currency>`.
 *      Anything outside this subset is preserved in the WebhookLog body
 *      for audit but not interpreted.
 *
 * Auth: shared secret via `x-webhook-secret` header (matches `WEBHOOK_SECRET`
 * env var). Every hit is logged to WebhookLog regardless of outcome so the
 * /settings/webhooks page can show provider activity + replay.
 *
 * Idempotency:
 *   - `created`: if a booking with `externalRef = reservationId` exists,
 *     short-circuit with `deduplicated: true`.
 *   - `modified`: upsert dates/total; never re-create a guest record.
 *   - `cancelled`: mark booking status=cancelled (idempotent).
 */

interface BookingComPayload {
  hotelId?: string;
  /** Optional action; defaults to "created" when omitted. */
  action?: "created" | "modified" | "cancelled";
  reservationId: string;
  guest: { name: string; email?: string; phone?: string; country?: string };
  roomTypeName: string;
  /** YYYY-MM-DD */
  checkIn: string;
  checkOut: string;
  total?: number;
}

function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** Minimal XML parser: pulls attribute or inner-text by tag name. */
function xmlAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}\\s*=\\s*"([^"]*)"`, "i");
  const m = xml.match(re);
  return m?.[1] ?? null;
}
function xmlText(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([^<]*)</${tag}>`, "i");
  const m = xml.match(re);
  return m?.[1]?.trim() || null;
}

function parseXmlPayload(xml: string): BookingComPayload | null {
  const reservationId = xmlAttr(xml, "Reservation", "id");
  if (!reservationId) return null;
  const status = (xmlAttr(xml, "Reservation", "status") ?? "created").toLowerCase();
  const action: BookingComPayload["action"] =
    status.includes("cancel") ? "cancelled" : status.includes("modif") ? "modified" : "created";
  const guestName = xmlText(xml, "GuestName") ?? xmlAttr(xml, "Guest", "name");
  const guestEmail = xmlText(xml, "GuestEmail") ?? xmlAttr(xml, "Guest", "email") ?? undefined;
  const guestPhone = xmlText(xml, "GuestPhone") ?? undefined;
  const guestCountry = xmlText(xml, "GuestCountry") ?? xmlAttr(xml, "Guest", "country") ?? undefined;
  const roomTypeName = xmlText(xml, "RoomType") ?? xmlAttr(xml, "RoomType", "name");
  const checkIn = xmlText(xml, "CheckIn");
  const checkOut = xmlText(xml, "CheckOut");
  const totalRaw = xmlText(xml, "Total");
  if (!guestName || !roomTypeName || !checkIn || !checkOut) return null;
  return {
    action,
    reservationId,
    guest: { name: guestName, email: guestEmail, phone: guestPhone, country: guestCountry },
    roomTypeName,
    checkIn,
    checkOut,
    total: totalRaw ? parseInt(totalRaw, 10) : undefined,
  };
}

export async function POST(req: Request) {
  const startMs = Date.now();
  const rawBody = await req.text();
  let action: string | null = null;
  let logStatus: "ok" | "invalid_signature" | "bad_request" | "handler_error" = "ok";
  let responseBody: string | null = null;

  const finish = (res: NextResponse): NextResponse => {
    void logWebhook({
      provider: "booking_com",
      eventType: action,
      status: logStatus,
      httpStatus: res.status,
      responseBody,
      headers: req.headers,
      body: rawBody,
      durationMs: Date.now() - startMs,
    });
    return res;
  };

  // Auth: shared secret (rotate via env). Required in production — an unset
  // secret there would leave booking ingestion wide open, so we refuse. When
  // unset in dev the check is skipped for local convenience.
  const expectedSecret = process.env.WEBHOOK_SECRET;
  if (!expectedSecret) {
    if (process.env.NODE_ENV === "production") {
      logStatus = "bad_request";
      responseBody = "WEBHOOK_SECRET not configured";
      return finish(bad(503, responseBody));
    }
  } else {
    const provided = req.headers.get("x-webhook-secret");
    if (!secureCompare(provided, expectedSecret)) {
      logStatus = "invalid_signature";
      responseBody = "invalid webhook secret";
      return finish(bad(401, responseBody));
    }
  }

  // Parse payload — try JSON first, then XML
  let payload: BookingComPayload | null = null;
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("xml") || rawBody.trimStart().startsWith("<")) {
      payload = parseXmlPayload(rawBody);
      if (!payload) {
        logStatus = "bad_request";
        responseBody = "could not extract required fields from XML";
        return finish(bad(400, responseBody));
      }
    } else {
      payload = JSON.parse(rawBody) as BookingComPayload;
    }
  } catch {
    logStatus = "bad_request";
    responseBody = "invalid payload (not JSON or recognisable XML)";
    return finish(bad(400, responseBody));
  }

  if (!payload.reservationId) {
    logStatus = "bad_request";
    responseBody = "reservationId required";
    return finish(bad(400, responseBody));
  }
  action = payload.action ?? "created";

  try {
    // Resolve hotel: explicit > first hotel
    const hotelId =
      payload.hotelId ?? (await prisma.hotel.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;
    if (!hotelId) {
      logStatus = "handler_error";
      responseBody = "no hotel configured";
      return finish(bad(500, responseBody));
    }

    if (action === "cancelled") {
      return finish(await handleCancelled(hotelId, payload, (s) => { logStatus = s; }, (b) => { responseBody = b; }));
    }
    if (action === "modified") {
      return finish(await handleModified(hotelId, payload, (s) => { logStatus = s; }, (b) => { responseBody = b; }));
    }
    // default: created
    return finish(await handleCreated(hotelId, payload, (s) => { logStatus = s; }, (b) => { responseBody = b; }));
  } catch (e) {
    logStatus = "handler_error";
    responseBody = `handler error: ${e instanceof Error ? e.message : String(e)}`;
    return finish(bad(500, responseBody));
  }
}

// ── handlers ─────────────────────────────────────────────────────────

type SetStatus = (s: "ok" | "invalid_signature" | "bad_request" | "handler_error") => void;
type SetBody = (b: string | null) => void;

async function handleCreated(hotelId: string, p: BookingComPayload, setStatus: SetStatus, setBody: SetBody): Promise<NextResponse> {
  if (!p.guest?.name) { setStatus("bad_request"); setBody("guest.name required"); return bad(400, "guest.name required"); }
  if (!p.roomTypeName) { setStatus("bad_request"); setBody("roomTypeName required"); return bad(400, "roomTypeName required"); }
  if (!p.checkIn || !p.checkOut) { setStatus("bad_request"); setBody("checkIn/checkOut required"); return bad(400, "checkIn/checkOut required"); }

  const roomType = await prisma.roomType.findFirst({
    where: { hotelId, name: { contains: p.roomTypeName, mode: "insensitive" } },
    select: { id: true },
  });
  if (!roomType) {
    setStatus("bad_request");
    setBody(`roomType "${p.roomTypeName}" not mapped for hotel`);
    return bad(404, `roomType "${p.roomTypeName}" not mapped for hotel`);
  }

  // Idempotency: dedupe by externalRef
  const existing = await prisma.booking.findFirst({
    where: { hotelId, externalRef: p.reservationId },
    select: { id: true },
  });
  if (existing) {
    setBody(`already ingested: ${existing.id}`);
    return NextResponse.json({ ok: true, bookingId: existing.id, deduplicated: true });
  }

  const result = await createBooking({
    guestName: p.guest.name,
    guestEmail: p.guest.email,
    guestPhone: p.guest.phone,
    guestCountry: p.guest.country,
    roomTypeId: roomType.id,
    channelType: ChannelType.booking,
    checkIn: p.checkIn,
    checkOut: p.checkOut,
    total: p.total,
    externalRef: p.reservationId,
    hotelId,
  });

  if (!result.ok) {
    setStatus("handler_error");
    setBody(result.error);
    return bad(400, result.error);
  }
  setBody(`created booking ${result.bookingId}`);
  return NextResponse.json({ ok: true, action: "created", bookingId: result.bookingId, total: result.total, nights: result.nights });
}

async function handleModified(hotelId: string, p: BookingComPayload, setStatus: SetStatus, setBody: SetBody): Promise<NextResponse> {
  const existing = await prisma.booking.findFirst({
    where: { hotelId, externalRef: p.reservationId },
  });
  // Modified for an unknown reservation — fall back to create so we don't lose data
  if (!existing) {
    setBody("upgrading modified→created (booking not found locally)");
    return handleCreated(hotelId, p, setStatus, setBody);
  }

  const checkIn = new Date(`${p.checkIn}T00:00:00Z`);
  const checkOut = new Date(`${p.checkOut}T00:00:00Z`);
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
    setStatus("bad_request");
    setBody("invalid date format");
    return bad(400, "invalid date format");
  }

  const data: { checkIn: Date; checkOut: Date; total?: number } = { checkIn, checkOut };
  if (typeof p.total === "number") data.total = p.total;

  await prisma.$transaction([
    prisma.booking.update({ where: { id: existing.id }, data }),
    prisma.bookingEvent.create({
      data: {
        bookingId: existing.id,
        type: BookingEventType.message_received, // Booking.com modifications surfaced as audit events
        occurredAt: new Date(),
        body: `booking.com modified: ${p.checkIn}→${p.checkOut}${p.total ? ` ₩${p.total.toLocaleString()}` : ""}`,
      },
    }),
  ]);
  setBody(`modified booking ${existing.id}`);
  return NextResponse.json({ ok: true, action: "modified", bookingId: existing.id });
}

async function handleCancelled(hotelId: string, p: BookingComPayload, setStatus: SetStatus, setBody: SetBody): Promise<NextResponse> {
  const existing = await prisma.booking.findFirst({
    where: { hotelId, externalRef: p.reservationId },
  });
  if (!existing) {
    setBody("cancelled but booking not found — ignoring");
    return NextResponse.json({ ok: true, action: "cancelled", skipped: "not_found" });
  }
  if (existing.status === BookingStatus.cancelled) {
    setBody("already cancelled");
    return NextResponse.json({ ok: true, action: "cancelled", alreadyCancelled: true });
  }
  await prisma.$transaction([
    prisma.booking.update({ where: { id: existing.id }, data: { status: BookingStatus.cancelled } }),
    prisma.bookingEvent.create({
      data: {
        bookingId: existing.id,
        type: BookingEventType.cancelled,
        occurredAt: new Date(),
        body: "cancelled via Booking.com webhook",
      },
    }),
  ]);
  setBody(`cancelled booking ${existing.id}`);
  return NextResponse.json({ ok: true, action: "cancelled", bookingId: existing.id });
}
