"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { headers } from "next/headers";
import { assertHotelOwnership, currentHotelId, hasActiveSession } from "./tenant";
import { getAutomationTickDetail, getRecentActivity, getWebhookLogDetail, searchCommands, type ActivityItem, type AutomationTickDetail, type CommandItem, type WebhookLogDetail } from "./queries";
import { getStripe, stripeEnabled } from "./stripe";
import {
  BookingEventType,
  BookingStatus,
  PaymentStatus,
  ChannelStatus,
  MessageSender,
  MiddlewareStatus,
  type MiddlewareType,
  SyncOp,
  SyncResult,
  type ChannelType,
} from "@prisma/client";

export interface BulkEditInput {
  roomTypeId: string;
  /** YYYY-MM-DD inclusive */
  startDate: string;
  /** YYYY-MM-DD inclusive */
  endDate: string;
  /** New rate in KRW. Omit to leave rates untouched. */
  rate?: number;
  /** New available inventory. Omit to leave inventory untouched. */
  inventory?: number;
  /** New min-stay in nights. Omit to leave untouched. */
  minStay?: number;
  /** Channels to apply rate change to. Required when rate is set. */
  channels?: ChannelType[];
}

export interface BulkEditResult {
  ok: true;
  roomTypeId: string;
  daysAffected: number;
  ratesUpdated: number;
  inventoryUpdated: number;
  /** Channels that received the rate push (had a ChannelMap for this room type). */
  channelsPushed: ChannelType[];
  /** Channels skipped because no ChannelMap mapped them to this room type. */
  channelsSkipped: ChannelType[];
}

export interface BulkEditError {
  ok: false;
  error: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(s: string): Date {
  if (!ISO_DATE_RE.test(s)) throw new Error(`Invalid date: ${s}`);
  return new Date(`${s}T00:00:00.000Z`);
}

function dateRange(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(new Date(d));
  }
  return out;
}

export async function applyBulkEdit(input: BulkEditInput): Promise<BulkEditResult | BulkEditError> {
  try {
    if (!input.roomTypeId) return { ok: false, error: "roomTypeId required" };

    const start = parseIsoDate(input.startDate);
    const end = parseIsoDate(input.endDate);
    if (start.getTime() > end.getTime()) return { ok: false, error: "startDate must be ≤ endDate" };

    const days = dateRange(start, end);
    if (days.length === 0) return { ok: false, error: "empty date range" };
    if (days.length > 60) return { ok: false, error: "range too large (>60 days)" };

    const rate = input.rate;
    const inventory = input.inventory;
    const minStay = input.minStay;
    const channels = input.channels ?? [];

    if (rate === undefined && inventory === undefined && minStay === undefined) {
      return { ok: false, error: "no fields to update" };
    }
    if (rate !== undefined && (rate < 0 || rate > 100_000_000)) {
      return { ok: false, error: "rate out of range" };
    }
    if (inventory !== undefined && (inventory < 0 || inventory > 999)) {
      return { ok: false, error: "inventory out of range" };
    }
    if (minStay !== undefined && (minStay < 1 || minStay > 30)) {
      return { ok: false, error: "minStay out of range" };
    }
    if (rate !== undefined && channels.length === 0) {
      return { ok: false, error: "channels required when rate is set" };
    }

    const roomType = await prisma.roomType.findUnique({
      where: { id: input.roomTypeId },
      include: { rooms: { select: { id: true } } },
    });
    if (!roomType) return { ok: false, error: "room type not found" };
    await assertHotelOwnership(roomType.hotelId);

    let ratesUpdated = 0;
    let inventoryUpdated = 0;
    const channelsPushed: ChannelType[] = [];
    const channelsSkipped: ChannelType[] = [];

    if (inventory !== undefined || minStay !== undefined) {
      for (const date of days) {
        const data: { available?: number; minStay?: number } = {};
        if (inventory !== undefined) data.available = Math.min(inventory, roomType.rooms.length);
        if (minStay !== undefined) data.minStay = minStay;
        await prisma.inventory.upsert({
          where: { roomTypeId_date: { roomTypeId: roomType.id, date } },
          create: {
            roomTypeId: roomType.id,
            date,
            available: data.available ?? roomType.rooms.length,
            minStay: data.minStay ?? 1,
          },
          update: data,
        });
        inventoryUpdated++;
      }

      // Emit a SyncLog row per channel that has this room type mapped — represents
      // the "push to OTA" we'd perform after the local DB write.
      const mappedInvChannels = await prisma.channel.findMany({
        where: { hotelId: roomType.hotelId, mappings: { some: { roomTypeId: roomType.id } } },
        select: { id: true, type: true },
      });
      for (const ch of mappedInvChannels) {
        await prisma.syncLog.create({
          data: {
            channelId: ch.id,
            op: SyncOp.push_inventory,
            target: `${roomType.name} × ${days.length} days`,
            result: SyncResult.success,
            durationMs: 80 + Math.floor(Math.random() * 220),
            occurredAt: new Date(),
          },
        });
      }
    }

    if (rate !== undefined && channels.length > 0) {
      const standardPlan = await prisma.ratePlan.findFirst({
        where: { roomTypeId: roomType.id, name: "Standard" },
      });
      if (!standardPlan) return { ok: false, error: "Standard rate plan missing for room type" };

      // Only fetch channels that BOTH match the user's selection AND have a
      // ChannelMap for this room type. Unmapped channels are skipped + reported.
      const eligibleChannels = await prisma.channel.findMany({
        where: {
          hotelId: roomType.hotelId,
          type: { in: channels },
          mappings: { some: { roomTypeId: roomType.id } },
        },
        select: {
          id: true,
          type: true,
          // Include the per-room-type mapping so the Hostaway push knows
          // which externalId (listingId) to address.
          mappings: { where: { roomTypeId: roomType.id }, select: { externalId: true, roomTypeId: true } },
        },
      });
      const eligibleTypes = new Set(eligibleChannels.map((c) => c.type));
      for (const t of channels) {
        if (eligibleTypes.has(t)) channelsPushed.push(t);
        else channelsSkipped.push(t);
      }

      for (const date of days) {
        for (const ch of eligibleChannels) {
          await prisma.rate.upsert({
            where: {
              roomTypeId_ratePlanId_channelId_date: {
                roomTypeId: roomType.id,
                ratePlanId: standardPlan.id,
                channelId: ch.id,
                date,
              },
            },
            create: {
              roomTypeId: roomType.id,
              ratePlanId: standardPlan.id,
              channelId: ch.id,
              date,
              amount: rate,
            },
            update: { amount: rate },
          });
          ratesUpdated++;
        }
      }

      // SyncLog per channel that was actually pushed
      for (const ch of eligibleChannels) {
        await prisma.syncLog.create({
          data: {
            channelId: ch.id,
            op: SyncOp.push_rates,
            target: `${roomType.name} × ${days.length} days`,
            result: SyncResult.success,
            durationMs: 100 + Math.floor(Math.random() * 280),
            occurredAt: new Date(),
          },
        });
      }
      // Optionally push to Hostaway middleware as well — fire-and-forget so
      // the bulk edit's response time isn't held hostage by a slow upstream.
      // Mock mode is a no-op (just logs; doesn't write extra SyncLog rows).
      const middleware = await prisma.middleware.findFirst({
        where: { hotelId: roomType.hotelId, type: "hostaway", status: MiddlewareStatus.connected },
        select: { id: true },
      });
      if (middleware) {
        const items = days.flatMap((d) =>
          eligibleChannels
            .map((ch) => ({ ch, mapping: ch.mappings.find((m) => m.roomTypeId === roomType.id) }))
            .filter((p) => p.mapping)
            .map((p) => ({
              listingId: p.mapping!.externalId,
              date: d.toISOString().slice(0, 10),
              available: input.inventory ?? 0,
              price: input.rate,
              minStay: input.minStay,
            })),
        );
        if (items.length > 0) {
          void (async () => {
            try {
              const { pushInventoryAndRates } = await import("./hostaway");
              const r = await pushInventoryAndRates(items);
              await prisma.syncLog.create({
                data: {
                  channelId: eligibleChannels[0].id,
                  op: SyncOp.push_rates,
                  target: `Hostaway × ${r.pushed} updates (${r.mode})`,
                  result: r.ok ? SyncResult.success : SyncResult.error,
                  durationMs: 0,
                  occurredAt: new Date(),
                  note: r.error ?? null,
                },
              });
            } catch {
              // Don't fail the bulk edit when the upstream push errors.
            }
          })();
        }
      }
    }

    safeRevalidate(["/calendar", "/rooms", "/channels"]);

    return {
      ok: true,
      roomTypeId: roomType.id,
      daysAffected: days.length,
      ratesUpdated,
      inventoryUpdated,
      channelsPushed,
      channelsSkipped,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/**
 * Posts a system-flavored host message into the matching guest thread when a
 * booking transitions through certain milestones. Looks up SavedReply by
 * label; silently skips if no thread or saved reply exists.
 */
async function maybeAutoMessage(bookingId: string, action: BookingStatusAction) {
  const replyLabel = action === "check_in"
    ? "체크인 안내"
    : action === "check_out"
      ? "리뷰 요청"
      : null;
  if (!replyLabel) return;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { hotelId: true, guestId: true, channelId: true },
  });
  if (!booking?.channelId) return;

  const [thread, savedReply] = await Promise.all([
    prisma.thread.findFirst({
      where: { hotelId: booking.hotelId, guestId: booking.guestId, channelId: booking.channelId },
      select: { id: true },
    }),
    prisma.savedReply.findFirst({
      where: { hotelId: booking.hotelId, label: replyLabel },
      select: { body: true },
    }),
  ]);
  if (!thread || !savedReply) return;

  const now = new Date();
  await prisma.message.create({
    data: { threadId: thread.id, sender: "host", body: savedReply.body, createdAt: now },
  });
  await prisma.thread.update({
    where: { id: thread.id },
    data: { lastMessageAt: now },
  });
}

/**
 * Server action callable from client components for polling-based "realtime"
 * activity refresh. Falls under hotelId scope automatically.
 */
export async function fetchRecentActivity(): Promise<ActivityItem[]> {
  return getRecentActivity(20);
}

/** Server-side search for the ⌘K command palette. */
export async function fetchCommands(query: string): Promise<CommandItem[]> {
  return searchCommands(query, 30);
}

/** Per-tick detail for the /automations drawer. */
export async function fetchAutomationTickDetail(tickId: string): Promise<AutomationTickDetail | null> {
  return getAutomationTickDetail(tickId);
}

/** Per-webhook detail for the /settings/webhooks drawer. */
export async function fetchWebhookLogDetail(id: string): Promise<WebhookLogDetail | null> {
  return getWebhookLogDetail(id);
}

export interface WebhookReplayResult {
  ok: true;
  newLogId: string;
  httpStatus: number;
  responseBody: string | null;
}

/**
 * Re-POSTs a stored webhook to its own provider endpoint, replaying the
 * original headers + body. Useful for retrying after fixing a bug. The
 * inbound handler will write a NEW WebhookLog row for the replay attempt.
 */
export async function replayWebhook(id: string): Promise<WebhookReplayResult | BulkEditError> {
  try {
    const detail = await getWebhookLogDetail(id);
    if (!detail) return { ok: false, error: "log not found" };
    const { headers: hdrList } = await import("next/headers");
    const reqHeaders = await hdrList();
    const proto = reqHeaders.get("x-forwarded-proto") ?? "http";
    const host = reqHeaders.get("host") ?? "localhost:3000";
    const path = `/api/webhooks/${detail.provider === "booking_com" ? "booking-com" : detail.provider}`;
    const url = `${proto}://${host}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: detail.headers,
      body: detail.body,
    });
    const text = await res.text().catch(() => null);
    // Find the newly-written log row (created by the handler we just hit)
    const fresh = await prisma.webhookLog.findFirst({
      where: { provider: detail.provider, receivedAt: { gt: new Date(Date.now() - 30_000) } },
      orderBy: { receivedAt: "desc" },
    });
    safeRevalidate(["/settings/webhooks"]);
    return {
      ok: true,
      newLogId: fresh?.id ?? id,
      httpStatus: res.status,
      responseBody: text,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function safeRevalidate(paths: string[]) {
  try {
    for (const p of paths) revalidatePath(p);
  } catch {
    // revalidatePath only works inside a Next.js request context;
    // ignore failures so actions stay callable from scripts/tests.
  }
}

export interface CreateBookingInput {
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  guestCountry?: string;
  guestLanguage?: string;
  roomTypeId: string;
  channelType: ChannelType;
  /** YYYY-MM-DD */
  checkIn: string;
  /** YYYY-MM-DD */
  checkOut: string;
  /** Total in KRW. If omitted, computed as nights × Standard rate for the channel on checkIn. */
  total?: number;
  notes?: string;
  externalRef?: string;
  /** Explicit hotel scope — used by webhooks to bypass session-based currentHotelId(). */
  hotelId?: string;
}

export interface CreateBookingResult {
  ok: true;
  bookingId: string;
  guestId: string;
  total: number;
  nights: number;
}

export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult | BulkEditError> {
  try {
    if (!input.guestName.trim()) return { ok: false, error: "guestName required" };
    if (!input.roomTypeId) return { ok: false, error: "roomTypeId required" };

    const checkIn = parseIsoDate(input.checkIn);
    const checkOut = parseIsoDate(input.checkOut);
    if (checkOut.getTime() <= checkIn.getTime()) {
      return { ok: false, error: "checkOut must be after checkIn" };
    }
    const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000);
    if (nights > 90) return { ok: false, error: "stay too long (>90 nights)" };

    const roomType = await prisma.roomType.findUnique({ where: { id: input.roomTypeId } });
    if (!roomType) return { ok: false, error: "room type not found" };

    // Authoritative tenant = the caller's session hotel. A client-supplied
    // `input.hotelId` is only honored for sessionless server-to-server callers
    // (e.g. the Booking.com webhook). A logged-in user may NOT target another
    // hotel by passing a foreign hotelId — this is a public "use server"
    // action, so its arguments are attacker-controllable.
    const sessionHotelId = await currentHotelId();
    let expectedHotelId = sessionHotelId;
    if (input.hotelId && input.hotelId !== sessionHotelId) {
      if (await hasActiveSession()) {
        return { ok: false, error: "forbidden: cannot create a booking for another hotel" };
      }
      // No session → trusted ingestion path; honor the explicit hotelId.
      expectedHotelId = input.hotelId;
    }
    if (roomType.hotelId !== expectedHotelId) {
      return { ok: false, error: "room type does not belong to this hotel" };
    }

    const channel = await prisma.channel.findFirst({
      where: { hotelId: roomType.hotelId, type: input.channelType },
    });
    if (!channel) return { ok: false, error: `channel ${input.channelType} not connected for hotel` };

    let total = input.total;
    if (total === undefined) {
      // Compute from Standard plan rate on the check-in date
      const rate = await prisma.rate.findFirst({
        where: {
          roomTypeId: roomType.id,
          channelId: channel.id,
          date: checkIn,
          ratePlan: { name: "Standard" },
        },
      });
      total = (rate?.amount ?? roomType.baseRate) * nights;
    }

    // Guest: reuse by (hotel, email) if email provided, else create new
    let guest = null as Awaited<ReturnType<typeof prisma.guest.findFirst>>;
    if (input.guestEmail && input.guestEmail.trim()) {
      guest = await prisma.guest.findFirst({
        where: { hotelId: roomType.hotelId, email: input.guestEmail.trim() },
      });
    }
    if (!guest) {
      guest = await prisma.guest.create({
        data: {
          hotelId: roomType.hotelId,
          name: input.guestName.trim(),
          email: input.guestEmail?.trim() || null,
          phone: input.guestPhone?.trim() || null,
          country: input.guestCountry?.trim() || null,
          language: input.guestLanguage?.trim() || null,
        },
      });
    }

    const booking = await prisma.booking.create({
      data: {
        hotelId: roomType.hotelId,
        channelId: channel.id,
        externalRef: input.externalRef ?? null,
        guestId: guest.id,
        roomTypeId: roomType.id,
        checkIn,
        checkOut,
        status: "confirmed",
        payment: "pending",
        total,
        notes: input.notes?.trim() || null,
        events: { create: [{ type: BookingEventType.created, occurredAt: new Date(), body: null }] },
      },
    });

    safeRevalidate(["/bookings", "/", "/calendar"]);

    // Fire-and-forget push notification to staff. Mock mode just logs.
    void (async () => {
      try {
        const { sendPushToHotel } = await import("./push");
        await sendPushToHotel(input.hotelId ?? booking.hotelId, {
          title: "신규 예약",
          body: `${input.guestName} · ${input.checkIn} → ${input.checkOut} · ₩${total.toLocaleString()}`,
          url: `/bookings`,
          tag: `booking-${booking.id}`,
        });
      } catch {
        // Don't break the booking flow if push fails.
      }
    })();

    // Cross-channel inventory lock fan-out — every other OTA selling this
    // room type drops by 1. Fire-and-forget; failure logged but doesn't
    // break the booking. Real OTA push happens through Hostaway middleware
    // when configured.
    void (async () => {
      try {
        const { acquireInventoryLocks } = await import("./inventory-locks");
        await acquireInventoryLocks(booking.id);
      } catch {
        // Audit-only side-effect; safe to swallow.
      }
    })();

    // Slack/Discord fan-out (skipped silently when no integrations exist).
    void dispatchIntegrationEvent({
      hotelId: input.hotelId ?? booking.hotelId,
      event: IntegrationEvent.booking_created,
      payload: {
        title: `신규 예약 — ${input.guestName}`,
        description: `${input.checkIn} → ${input.checkOut} (${nights} nights) · ₩${total.toLocaleString()}`,
        url: `/bookings`,
        fields: [
          { label: "Channel", value: input.channelType ?? "direct" },
          { label: "Guest", value: input.guestName },
          { label: "Total", value: `₩${total.toLocaleString()}`, inline: true },
          { label: "Nights", value: String(nights), inline: true },
        ],
      },
    }).catch(() => undefined);

    return { ok: true, bookingId: booking.id, guestId: guest.id, total, nights };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export interface SyncNowResult {
  ok: true;
  channelId: string;
  lastSyncAt: string;
  durationMs: number;
}

export async function syncNowChannel(channelId: string): Promise<SyncNowResult | BulkEditError> {
  try {
    if (!channelId) return { ok: false, error: "channelId required" };
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return { ok: false, error: "channel not found" };
    await assertHotelOwnership(channel.hotelId);

    // Simulate work — record duration so the UI's "ms" column has something interesting
    const startedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 80 + Math.floor(Math.random() * 200)));
    const durationMs = Date.now() - startedAt;
    const now = new Date();

    const updated = await prisma.channel.update({
      where: { id: channel.id },
      data: { status: ChannelStatus.synced, lastSyncAt: now },
    });

    await prisma.syncLog.create({
      data: {
        channelId: channel.id,
        op: SyncOp.push_inventory,
        target: "manual sync · 14 days × all rooms",
        result: SyncResult.success,
        durationMs,
        occurredAt: now,
      },
    });

    safeRevalidate(["/channels", "/"]);

    // If channel has iCal feed, also pull bookings opportunistically (best-effort)
    if (channel.icalUrl) {
      pullChannelICal(channel.id).catch(() => {
        // best-effort — sync_log row already records the manual sync attempt
      });
    }

    return { ok: true, channelId: updated.id, lastSyncAt: now.toISOString(), durationMs };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export type BookingStatusAction = "check_in" | "check_out" | "cancel" | "mark_paid" | "mark_refunded";

export interface SetBookingStatusResult {
  ok: true;
  bookingId: string;
  status: BookingStatus;
  payment: PaymentStatus;
}

export async function setBookingStatus(
  bookingId: string,
  action: BookingStatusAction,
): Promise<SetBookingStatusResult | BulkEditError> {
  try {
    if (!bookingId) return { ok: false, error: "bookingId required" };
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return { ok: false, error: "booking not found" };
    await assertHotelOwnership(booking.hotelId);

    let nextStatus = booking.status;
    let nextPayment = booking.payment;
    let eventType: BookingEventType | null = null;
    let eventBody: string | null = null;

    switch (action) {
      case "check_in":
        if (booking.status !== BookingStatus.confirmed) {
          return { ok: false, error: "only confirmed bookings can be checked in" };
        }
        nextStatus = BookingStatus.in_house;
        eventType = BookingEventType.checked_in;
        break;
      case "check_out":
        if (booking.status !== BookingStatus.in_house) {
          return { ok: false, error: "only in-house bookings can be checked out" };
        }
        nextStatus = BookingStatus.checked_out;
        eventType = BookingEventType.checked_out;
        break;
      case "cancel":
        if (booking.status === BookingStatus.cancelled) {
          return { ok: false, error: "already cancelled" };
        }
        if (booking.status === BookingStatus.checked_out) {
          return { ok: false, error: "cannot cancel a checked-out booking" };
        }
        nextStatus = BookingStatus.cancelled;
        eventType = BookingEventType.cancelled;
        if (booking.payment === PaymentStatus.paid) {
          nextPayment = PaymentStatus.refunded;
        }
        break;
      case "mark_paid":
        if (booking.payment === PaymentStatus.paid) {
          return { ok: false, error: "already paid" };
        }
        nextPayment = PaymentStatus.paid;
        eventType = BookingEventType.payment_captured;
        eventBody = `₩${booking.total.toLocaleString()}`;
        break;
      case "mark_refunded":
        if (booking.payment !== PaymentStatus.paid) {
          return { ok: false, error: "only paid bookings can be refunded" };
        }
        nextPayment = PaymentStatus.refunded;
        eventType = BookingEventType.payment_refunded;
        eventBody = `₩${booking.total.toLocaleString()}`;
        break;
      default:
        return { ok: false, error: `unknown action: ${action as string}` };
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { status: nextStatus, payment: nextPayment },
    });

    if (eventType) {
      await prisma.bookingEvent.create({
        data: { bookingId: booking.id, type: eventType, occurredAt: new Date(), body: eventBody },
      });
    }

    await maybeAutoMessage(booking.id, action);

    // Cancel → reverse the cross-channel inventory locks so other OTAs
    // get their availability back. Fire-and-forget; audit-only side-effect.
    if (action === "cancel") {
      void (async () => {
        try {
          const { releaseInventoryLocks } = await import("./inventory-locks");
          await releaseInventoryLocks(booking.id);
        } catch {
          // swallow — locks remain marked active until manual cleanup
        }
      })();
    }

    safeRevalidate(["/bookings", "/", "/calendar", "/messages"]);
    return { ok: true, bookingId: updated.id, status: updated.status, payment: updated.payment };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export interface ApplyRecommendationResult {
  ok: true;
  daysAffected: number;
  ratesUpdated: number;
}

/** Convenience wrapper around applyBulkEdit for a single (rt, date, all-channels) cell. */
export async function applyRateRecommendation(
  roomTypeId: string,
  date: string,
  rate: number,
): Promise<ApplyRecommendationResult | BulkEditError> {
  const r = await applyBulkEdit({
    roomTypeId,
    startDate: date,
    endDate: date,
    rate,
    channels: ["airbnb", "booking", "agoda", "trip", "direct"] as unknown as ChannelType[],
  });
  if (!r.ok) return r;
  return { ok: true, daysAffected: r.daysAffected, ratesUpdated: r.ratesUpdated };
}

export interface CheckoutSessionResult {
  ok: true;
  url: string;
  sessionId: string;
}

export async function createBookingCheckoutSession(bookingId: string): Promise<CheckoutSessionResult | BulkEditError> {
  try {
    if (!stripeEnabled) return { ok: false, error: "Stripe not configured (set STRIPE_SECRET_KEY)" };
    if (!bookingId) return { ok: false, error: "bookingId required" };

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { guest: { select: { name: true, email: true } }, roomType: { select: { name: true } } },
    });
    if (!booking) return { ok: false, error: "booking not found" };
    await assertHotelOwnership(booking.hotelId);
    if (booking.payment === "paid") return { ok: false, error: "already paid" };

    const stripe = getStripe();
    const hdrs = await headers();
    const origin = hdrs.get("origin") ?? `http://${hdrs.get("host") ?? "localhost:3017"}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "krw",
            product_data: {
              name: `${booking.roomType.name} · ${booking.guest.name}`,
              description: `${booking.checkIn.toISOString().slice(0, 10)} → ${booking.checkOut.toISOString().slice(0, 10)}`,
            },
            unit_amount: booking.total,
          },
        },
      ],
      customer_email: booking.guest.email ?? undefined,
      success_url: `${origin}/bookings?paid=${booking.id}`,
      cancel_url: `${origin}/bookings?cancelled=${booking.id}`,
      metadata: { bookingId: booking.id, hotelId: booking.hotelId },
    });

    if (!session.url) return { ok: false, error: "Stripe did not return a URL" };
    return { ok: true, url: session.url, sessionId: session.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface SendMessageResult {
  ok: true;
  messageId: string;
  threadId: string;
}

export interface PullICalResult {
  ok: true;
  channelId: string;
  fetched: number;
  created: number;
  skipped: number;
  errors: number;
}

/**
 * Pulls bookings from a Channel.icalUrl (RFC 5545 .ics feed) and creates new
 * Booking rows in our DB. Idempotent on (channelId, externalRef = VEVENT.uid).
 *
 * Used by Airbnb-style "Import Calendar URL" connections — the most accessible
 * path for individual hosts who don't qualify for the full Channel Connectivity API.
 */
export async function pullChannelICal(channelId: string): Promise<PullICalResult | BulkEditError> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return { ok: false, error: "channel not found" };
    await assertHotelOwnership(channel.hotelId);
    if (!channel.icalUrl) return { ok: false, error: "channel has no icalUrl configured" };

    const ical = (await import("node-ical")) as unknown as { async: { fromURL: (url: string) => Promise<Record<string, IcsComponent>> } };
    const data = await ical.async.fromURL(channel.icalUrl);

    const events = Object.values(data).filter((c): c is IcsComponent => !!c && c.type === "VEVENT");

    // Pick the first room type for this hotel as ingest target
    const roomType = await prisma.roomType.findFirst({ where: { hotelId: channel.hotelId } });
    if (!roomType) return { ok: false, error: "no room type to attach bookings to" };

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const e of events) {
      try {
        if (!e.uid || !e.start || !e.end) {
          skipped++;
          continue;
        }
        const externalRef = `ICAL-${e.uid}`;
        const exists = await prisma.booking.findFirst({
          where: { hotelId: channel.hotelId, externalRef },
          select: { id: true },
        });
        if (exists) {
          skipped++;
          continue;
        }

        const checkIn = startOfDayUtc(toDate(e.start));
        const checkOut = startOfDayUtc(toDate(e.end));
        if (checkOut.getTime() <= checkIn.getTime()) {
          skipped++;
          continue;
        }

        // iCal feeds usually omit guest names ("Reserved" placeholders) — derive
        // a synthetic guest from summary or fall back to the channel + uid.
        const guestName = (typeof e.summary === "string" && e.summary.trim()) || `${channel.type.toUpperCase()} guest`;

        const guest = await prisma.guest.create({
          data: { hotelId: channel.hotelId, name: guestName.slice(0, 80) },
        });

        const nights = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000));
        await prisma.booking.create({
          data: {
            hotelId: channel.hotelId,
            channelId: channel.id,
            externalRef,
            guestId: guest.id,
            roomTypeId: roomType.id,
            checkIn,
            checkOut,
            status: BookingStatus.confirmed,
            payment: PaymentStatus.paid, // iCal feeds = already-paid OTA bookings
            total: roomType.baseRate * nights,
            events: {
              create: [
                { type: BookingEventType.created, occurredAt: new Date(), body: `via iCal (${channel.type})` },
                { type: BookingEventType.payment_captured, occurredAt: new Date(), body: `${channel.type} prepaid` },
              ],
            },
          },
        });
        created++;
      } catch {
        errors++;
      }
    }

    await prisma.channel.update({
      where: { id: channel.id },
      data: { lastSyncAt: new Date(), status: ChannelStatus.synced },
    });
    await prisma.syncLog.create({
      data: {
        channelId: channel.id,
        op: SyncOp.pull_bookings,
        target: `iCal: ${created} new / ${skipped} skipped / ${errors} err`,
        result: errors > 0 ? SyncResult.warn : SyncResult.success,
        note: `iCal pull from ${channel.icalUrl?.slice(0, 60) ?? ""}…`,
      },
    });

    safeRevalidate(["/channels", "/bookings", "/calendar", "/"]);
    return { ok: true, channelId: channel.id, fetched: events.length, created, skipped, errors };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

interface IcsComponent {
  type?: string;
  uid?: string;
  start?: Date | string;
  end?: Date | string;
  summary?: string;
}

export async function generateChannelICalExportToken(channelId: string): Promise<{ ok: true; token: string } | BulkEditError> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return { ok: false, error: "channel not found" };
    await assertHotelOwnership(channel.hotelId);
    const token = `${channel.id.slice(-6)}${randomToken(24)}`;
    await prisma.channel.update({ where: { id: channel.id }, data: { icalExportToken: token } });
    safeRevalidate(["/channels"]);
    return { ok: true, token };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function revokeChannelICalExportToken(channelId: string): Promise<{ ok: true } | BulkEditError> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return { ok: false, error: "channel not found" };
    await assertHotelOwnership(channel.hotelId);
    await prisma.channel.update({ where: { id: channel.id }, data: { icalExportToken: null } });
    safeRevalidate(["/channels"]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function randomToken(len: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function setBookingNotes(bookingId: string, notes: string): Promise<{ ok: true } | BulkEditError> {
  try {
    if (!bookingId) return { ok: false, error: "bookingId required" };
    if (notes.length > 4000) return { ok: false, error: "notes too long (>4000 chars)" };
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return { ok: false, error: "booking not found" };
    await assertHotelOwnership(booking.hotelId);
    await prisma.booking.update({
      where: { id: booking.id },
      data: { notes: notes.trim() || null },
    });
    safeRevalidate(["/bookings"]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setChannelMapping(
  channelId: string,
  roomTypeId: string,
  externalId: string | null,
): Promise<{ ok: true } | BulkEditError> {
  try {
    if (!channelId || !roomTypeId) return { ok: false, error: "channelId + roomTypeId required" };
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return { ok: false, error: "channel not found" };
    await assertHotelOwnership(channel.hotelId);

    const rt = await prisma.roomType.findUnique({ where: { id: roomTypeId } });
    if (!rt) return { ok: false, error: "room type not found" };
    if (rt.hotelId !== channel.hotelId) return { ok: false, error: "room type does not belong to this channel's hotel" };

    const cleaned = externalId?.trim() || null;

    if (cleaned === null) {
      // Delete the mapping if it exists; safe no-op if it doesn't
      await prisma.channelMap.deleteMany({ where: { channelId, roomTypeId } });
    } else {
      await prisma.channelMap.upsert({
        where: { channelId_roomTypeId: { channelId, roomTypeId } },
        create: { channelId, roomTypeId, externalId: cleaned },
        update: { externalId: cleaned },
      });
    }

    safeRevalidate(["/channels"]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setChannelICalUrl(channelId: string, url: string | null): Promise<{ ok: true } | BulkEditError> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) return { ok: false, error: "channel not found" };
    await assertHotelOwnership(channel.hotelId);

    const cleaned = url?.trim() || null;
    if (cleaned && !/^https?:\/\//i.test(cleaned)) {
      return { ok: false, error: "URL must start with http(s)://" };
    }

    await prisma.channel.update({ where: { id: channel.id }, data: { icalUrl: cleaned } });
    safeRevalidate(["/channels"]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export interface ConnectMiddlewareResult {
  ok: true;
  middlewareId: string;
}

export async function connectMiddleware(input: {
  type: MiddlewareType;
  propertyId?: string;
  apiKey?: string;
}): Promise<ConnectMiddlewareResult | BulkEditError> {
  try {
    const hotelId = await currentHotelId();
    const existing = await prisma.middleware.findFirst({
      where: { hotelId, type: input.type },
      select: { id: true },
    });
    const credentials = input.apiKey ? { apiKey: input.apiKey } : null;
    let id: string;
    if (existing) {
      const m = await prisma.middleware.update({
        where: { id: existing.id },
        data: {
          status: MiddlewareStatus.connected,
          propertyId: input.propertyId ?? null,
          credentials: credentials ?? undefined,
          lastSyncAt: new Date(),
        },
      });
      id = m.id;
    } else {
      const m = await prisma.middleware.create({
        data: {
          hotelId,
          type: input.type,
          status: MiddlewareStatus.connected,
          propertyId: input.propertyId ?? null,
          credentials: credentials ?? undefined,
          lastSyncAt: new Date(),
        },
      });
      id = m.id;
    }
    safeRevalidate(["/channels"]);
    return { ok: true, middlewareId: id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface SyncMiddlewareResult {
  ok: true;
  middlewareId: string;
  mode: "real" | "mock";
  fetched: number;
  created: number;
  /** How many newly-created bookings used a real ChannelMap match (rest used fallback) */
  mapped: number;
}

export async function syncMiddleware(middlewareId: string): Promise<SyncMiddlewareResult | BulkEditError> {
  try {
    const m = await prisma.middleware.findUnique({ where: { id: middlewareId } });
    if (!m) return { ok: false, error: "middleware not found" };
    await assertHotelOwnership(m.hotelId);
    if (m.status !== "connected") return { ok: false, error: "middleware not connected" };
    if (m.type !== "hostaway") return { ok: false, error: "only Hostaway is wired up so far" };

    const { fetchHostawayReservations } = await import("./hostaway");

    // Build channel-keyed listingId pool from existing ChannelMap so the mock
    // returns reservations whose listingId actually resolves to a room type.
    const allChannels = await prisma.channel.findMany({
      where: { hotelId: m.hotelId },
      include: { mappings: { select: { externalId: true, roomTypeId: true } } },
    });
    const mappingPool: Record<string, string[]> = {};
    const mappingByPair = new Map<string, string>(); // `${channelType}:${externalId}` → roomTypeId
    for (const ch of allChannels) {
      mappingPool[ch.type] = ch.mappings.map((mm) => mm.externalId);
      for (const mm of ch.mappings) mappingByPair.set(`${ch.type}:${mm.externalId}`, mm.roomTypeId);
    }

    const result = await fetchHostawayReservations(m.propertyId ?? "default", { byChannel: mappingPool });

    const fallbackRoomType = await prisma.roomType.findFirst({ where: { hotelId: m.hotelId } });
    if (!fallbackRoomType) return { ok: false, error: "no room type" };

    let created = 0;
    let mapped = 0;
    for (const r of result.reservations) {
      const externalRef = `HW-${r.channelReservationId || r.id}`;
      const exists = await prisma.booking.findFirst({
        where: { hotelId: m.hotelId, externalRef },
        select: { id: true },
      });
      if (exists) continue;

      const guest = await prisma.guest.create({
        data: { hotelId: m.hotelId, name: r.guestName.slice(0, 80) },
      });
      const checkIn = new Date(`${r.arrivalDate}T00:00:00Z`);
      const checkOut = new Date(`${r.departureDate}T00:00:00Z`);
      if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) continue;

      const channel = await prisma.channel.findFirst({
        where: { hotelId: m.hotelId, type: r.channelName as ChannelType },
      });

      // Resolve room type via ChannelMap when listingId matches; else fall back
      let roomTypeId = fallbackRoomType.id;
      let mappedNote = "fallback room type";
      if (r.listingId) {
        const matched = mappingByPair.get(`${r.channelName}:${r.listingId}`);
        if (matched) {
          roomTypeId = matched;
          mappedNote = `matched listing ${r.listingId}`;
          mapped++;
        }
      }

      await prisma.booking.create({
        data: {
          hotelId: m.hotelId,
          channelId: channel?.id ?? null,
          externalRef,
          guestId: guest.id,
          roomTypeId,
          checkIn,
          checkOut,
          status: BookingStatus.confirmed,
          payment: PaymentStatus.paid,
          total: r.totalPrice,
          events: { create: [{ type: BookingEventType.created, occurredAt: new Date(), body: `via Hostaway (${result.mode}, ${mappedNote})` }] },
        },
      });
      created++;
    }

    await prisma.middleware.update({ where: { id: m.id }, data: { lastSyncAt: new Date() } });
    safeRevalidate(["/channels", "/bookings", "/calendar", "/"]);
    return {
      ok: true,
      middlewareId: m.id,
      mode: result.mode,
      fetched: result.reservations.length,
      created,
      mapped,
    } as SyncMiddlewareResult;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface ValidateHostawayResult {
  ok: true;
  mode: "real" | "mock";
  accountLabel?: string;
  listingCount?: number;
}

/**
 * Tests Hostaway credentials WITHOUT storing them. Use this to confirm an
 * API key + account id pair before persisting via `connectMiddleware`.
 * In mock mode (no env creds), returns a synthetic ok so the UI flow
 * stays clickable end-to-end.
 */
export async function validateHostawayCredentialsAction(input: { apiKey?: string; accountId?: string }): Promise<ValidateHostawayResult | BulkEditError> {
  try {
    const { validateHostawayCredentials } = await import("./hostaway");
    const r = await validateHostawayCredentials(input.apiKey, input.accountId);
    if (!r.ok) return { ok: false, error: r.error ?? "credentials rejected" };
    return { ok: true, mode: r.mode, accountLabel: r.accountLabel, listingCount: r.listingCount };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function disconnectMiddleware(middlewareId: string): Promise<{ ok: true } | BulkEditError> {
  try {
    const m = await prisma.middleware.findUnique({ where: { id: middlewareId } });
    if (!m) return { ok: false, error: "middleware not found" };
    await assertHotelOwnership(m.hotelId);
    await prisma.middleware.update({
      where: { id: middlewareId },
      data: { status: MiddlewareStatus.disconnected, credentials: undefined },
    });
    safeRevalidate(["/channels"]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendMessage(threadId: string, body: string): Promise<SendMessageResult | BulkEditError> {
  try {
    if (!threadId) return { ok: false, error: "threadId required" };
    const trimmed = body.trim();
    if (!trimmed) return { ok: false, error: "message body cannot be empty" };
    if (trimmed.length > 4000) return { ok: false, error: "message too long (>4000 chars)" };

    const thread = await prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread) return { ok: false, error: "thread not found" };
    await assertHotelOwnership(thread.hotelId);

    const now = new Date();
    const message = await prisma.message.create({
      data: { threadId: thread.id, sender: MessageSender.host, body: trimmed, createdAt: now },
    });

    // Host reply implies the operator has read everything → clear unread, bump lastMessageAt
    await prisma.thread.update({
      where: { id: thread.id },
      data: { lastMessageAt: now, unreadCount: 0 },
    });

    safeRevalidate(["/messages"]);
    return { ok: true, messageId: message.id, threadId: thread.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// ─── Uploads (logos / room photos) ─────────────────────────────────────

import { presignUpload, type PresignResult } from "./uploads";
import { UploadKind } from "@prisma/client";

export interface PresignUploadInput {
  filename: string;
  contentType: string;
  sizeBytes: number;
  kind: UploadKind;
}

export interface PresignUploadResult extends PresignResult {
  ok: true;
  /** Echo'd back so the client can pass it to `commitUpload` after the PUT. */
  kind: UploadKind;
}

export async function startUpload(input: PresignUploadInput): Promise<PresignUploadResult | BulkEditError> {
  try {
    const hotelId = await currentHotelId();
    const presigned = presignUpload({
      hotelId,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    });
    return { ok: true, kind: input.kind, ...presigned };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface CommitUploadInput {
  kind: UploadKind;
  filename: string;
  contentType: string;
  sizeBytes: number;
  /** Final public URL (for s3 mode) or `data:` URL (for dev fallback). */
  url: string;
  /** Optional natural key for the entity that owns this upload. */
  ownerRefId?: string | null;
}

export interface CommitUploadResult {
  ok: true;
  uploadId: string;
  url: string;
}

export async function commitUpload(input: CommitUploadInput): Promise<CommitUploadResult | BulkEditError> {
  try {
    const hotelId = await currentHotelId();
    if (input.sizeBytes <= 0 || input.sizeBytes > 5 * 1024 * 1024) {
      return { ok: false, error: "invalid sizeBytes" };
    }
    if (!input.url) return { ok: false, error: "url required" };
    const upload = await prisma.uploadedFile.create({
      data: {
        hotelId,
        kind: input.kind,
        filename: input.filename.slice(0, 200),
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        url: input.url,
        ownerRefId: input.ownerRefId ?? null,
      },
    });
    // Side-effect: hotel logos auto-attach to the hotel record.
    if (input.kind === UploadKind.hotel_logo) {
      await prisma.hotel.update({ where: { id: hotelId }, data: { logoUrl: upload.url } });
    }
    safeRevalidate(["/settings", "/"]);
    return { ok: true, uploadId: upload.id, url: upload.url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteUpload(uploadId: string): Promise<{ ok: true; deletedId: string } | BulkEditError> {
  try {
    if (!uploadId) return { ok: false, error: "uploadId required" };
    const existing = await prisma.uploadedFile.findUnique({ where: { id: uploadId } });
    if (!existing) return { ok: false, error: "not found" };
    await assertHotelOwnership(existing.hotelId);
    await prisma.uploadedFile.delete({ where: { id: uploadId } });
    safeRevalidate(["/rooms", "/settings"]);
    return { ok: true, deletedId: uploadId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Reorders room photos for a single room type. Caller passes the desired
 * order as an array of upload ids; sortIndex is rewritten 0..N-1 in a
 * single transaction.
 */
export async function reorderRoomPhotos(roomTypeId: string, orderedIds: string[]): Promise<{ ok: true } | BulkEditError> {
  try {
    if (!roomTypeId) return { ok: false, error: "roomTypeId required" };
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) return { ok: false, error: "orderedIds required" };
    const hotelId = await currentHotelId();
    // Tenant + ownership guard: every photo must belong to the right hotel + roomType
    const photos = await prisma.uploadedFile.findMany({
      where: { id: { in: orderedIds }, hotelId, ownerRefId: roomTypeId, kind: "room_photo" },
      select: { id: true },
    });
    if (photos.length !== orderedIds.length) {
      return { ok: false, error: "one or more photo ids not found for this room" };
    }
    await prisma.$transaction(
      orderedIds.map((id, idx) =>
        prisma.uploadedFile.update({ where: { id }, data: { sortIndex: idx } }),
      ),
    );
    safeRevalidate(["/rooms"]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function clearHotelLogo(): Promise<{ ok: true } | BulkEditError> {
  try {
    const hotelId = await currentHotelId();
    await prisma.hotel.update({ where: { id: hotelId }, data: { logoUrl: null } });
    safeRevalidate(["/settings", "/"]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Email templates ───────────────────────────────────────────────────

import { EmailTemplateKind } from "@prisma/client";

const TEMPLATE_KINDS = new Set<EmailTemplateKind>([
  EmailTemplateKind.checkin_reminder,
  EmailTemplateKind.review_request,
  EmailTemplateKind.payment_failed,
]);

export interface EmailTemplateUpsertInput {
  kind: EmailTemplateKind;
  subject: string;
  body: string;
  enabled: boolean;
}

export interface EmailTemplateUpsertResult {
  ok: true;
  id: string;
  kind: EmailTemplateKind;
}

export async function upsertEmailTemplate(input: EmailTemplateUpsertInput): Promise<EmailTemplateUpsertResult | BulkEditError> {
  try {
    if (!TEMPLATE_KINDS.has(input.kind)) return { ok: false, error: `unsupported kind: ${input.kind}` };
    const subject = input.subject.trim();
    const body = input.body.trim();
    if (!subject) return { ok: false, error: "subject required" };
    if (!body) return { ok: false, error: "body required" };
    if (subject.length > 200) return { ok: false, error: "subject too long (max 200)" };
    if (body.length > 4000) return { ok: false, error: "body too long (max 4000)" };
    const hotelId = await currentHotelId();
    const row = await prisma.emailTemplate.upsert({
      where: { hotelId_kind: { hotelId, kind: input.kind } },
      create: { hotelId, kind: input.kind, subject, body, enabled: input.enabled },
      update: { subject, body, enabled: input.enabled },
    });
    safeRevalidate(["/settings/email-templates"]);
    return { ok: true, id: row.id, kind: row.kind };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function resetEmailTemplate(kind: EmailTemplateKind): Promise<{ ok: true; kind: EmailTemplateKind } | BulkEditError> {
  try {
    if (!TEMPLATE_KINDS.has(kind)) return { ok: false, error: `unsupported kind: ${kind}` };
    const hotelId = await currentHotelId();
    await prisma.emailTemplate.deleteMany({ where: { hotelId, kind } });
    safeRevalidate(["/settings/email-templates"]);
    return { ok: true, kind };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Saved replies ─────────────────────────────────────────────────────

export interface SavedReplyResult { ok: true; id: string; label: string; body: string; }
export interface SavedReplyDeletedResult { ok: true; deletedId: string; }

export async function createSavedReply(label: string, body: string): Promise<SavedReplyResult | BulkEditError> {
  try {
    const hotelId = await currentHotelId();
    const l = label.trim();
    const b = body.trim();
    if (!l) return { ok: false, error: "label required" };
    if (!b) return { ok: false, error: "body required" };
    if (l.length > 60) return { ok: false, error: "label too long (max 60)" };
    if (b.length > 1200) return { ok: false, error: "body too long (max 1200)" };
    const dup = await prisma.savedReply.findFirst({ where: { hotelId, label: l } });
    if (dup) return { ok: false, error: "label already exists" };
    const created = await prisma.savedReply.create({ data: { hotelId, label: l, body: b } });
    safeRevalidate(["/settings", "/messages"]);
    return { ok: true, id: created.id, label: created.label, body: created.body };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateSavedReply(id: string, label: string, body: string): Promise<SavedReplyResult | BulkEditError> {
  try {
    if (!id) return { ok: false, error: "id required" };
    const existing = await prisma.savedReply.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "not found" };
    await assertHotelOwnership(existing.hotelId);
    const l = label.trim();
    const b = body.trim();
    if (!l) return { ok: false, error: "label required" };
    if (!b) return { ok: false, error: "body required" };
    if (l.length > 60) return { ok: false, error: "label too long (max 60)" };
    if (b.length > 1200) return { ok: false, error: "body too long (max 1200)" };
    if (l !== existing.label) {
      const dup = await prisma.savedReply.findFirst({ where: { hotelId: existing.hotelId, label: l, NOT: { id } } });
      if (dup) return { ok: false, error: "label already exists" };
    }
    const updated = await prisma.savedReply.update({ where: { id }, data: { label: l, body: b } });
    safeRevalidate(["/settings", "/messages"]);
    return { ok: true, id: updated.id, label: updated.label, body: updated.body };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteSavedReply(id: string): Promise<SavedReplyDeletedResult | BulkEditError> {
  try {
    if (!id) return { ok: false, error: "id required" };
    const existing = await prisma.savedReply.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: "not found" };
    await assertHotelOwnership(existing.hotelId);
    await prisma.savedReply.delete({ where: { id } });
    safeRevalidate(["/settings", "/messages"]);
    return { ok: true, deletedId: id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── CSV import ────────────────────────────────────────────────────────

import { runImport, type ColumnMapping, type ImportKind, type ImportSummary } from "./csv-import";

export interface CsvImportInput {
  kind: ImportKind;
  csv: string;
  mapping: ColumnMapping;
  dryRun: boolean;
}

export interface CsvImportSuccess extends ImportSummary {
  ok: true;
  dryRun: boolean;
  hotelId: string;
}

export async function importCsv(input: CsvImportInput): Promise<CsvImportSuccess | BulkEditError> {
  try {
    if (!input.csv || !input.kind || !input.mapping) {
      return { ok: false, error: "csv, kind, and mapping are required" };
    }
    if (input.csv.length > 5 * 1024 * 1024) return { ok: false, error: "csv too large (max 5MB)" };
    const hotelId = await currentHotelId();
    // Inject the resolved tenant id into mapping so the runImport stays
    // pure (no implicit currentHotelId() inside the lib module).
    const mapping = { ...input.mapping, __hotelId: hotelId };
    const r = await runImport({ ...input, mapping });
    if (!r.ok) return { ok: false, error: r.error };
    if (!input.dryRun) safeRevalidate(["/bookings", "/", "/calendar"]);
    return { ...r, dryRun: input.dryRun, hotelId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Push notifications ────────────────────────────────────────────────

import { PUSH_VAPID_PUBLIC_KEY } from "./push";

export interface PushSubscribeInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userKey?: string;
  userAgent?: string;
}

export interface PushSubscribeResult {
  ok: true;
  subscriptionId: string;
}

export async function subscribePush(input: PushSubscribeInput): Promise<PushSubscribeResult | BulkEditError> {
  try {
    if (!input.endpoint || !input.p256dh || !input.auth) {
      return { ok: false, error: "endpoint, p256dh, and auth are required" };
    }
    if (input.endpoint.length > 2000) return { ok: false, error: "endpoint too long" };
    const hotelId = await currentHotelId();
    const userKey = (input.userKey ?? "anon").slice(0, 80);
    // Upsert by endpoint (each device has its own endpoint URL)
    const row = await prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      update: {
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent?.slice(0, 200),
        userKey,
        hotelId,
        failureCount: 0,
      },
      create: {
        hotelId,
        userKey,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent?.slice(0, 200),
      },
    });
    return { ok: true, subscriptionId: row.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function unsubscribePush(endpoint: string): Promise<{ ok: true } | BulkEditError> {
  try {
    if (!endpoint) return { ok: false, error: "endpoint required" };
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Public VAPID key (or "" when push is in mock mode). Safe to read client-side. */
export async function getPushPublicKey(): Promise<{ publicKey: string; mock: boolean }> {
  return { publicKey: PUSH_VAPID_PUBLIC_KEY, mock: !PUSH_VAPID_PUBLIC_KEY };
}

// ─── Guest notes / tags ────────────────────────────────────────────────

export interface SetGuestNotesInput {
  guestId: string;
  notes?: string | null;
  tags?: string[] | null;
}

export interface SetGuestNotesResult {
  ok: true;
  guestId: string;
  notes: string | null;
  tags: string[];
}

export async function setGuestNotes(input: SetGuestNotesInput): Promise<SetGuestNotesResult | BulkEditError> {
  try {
    if (!input.guestId) return { ok: false, error: "guestId required" };
    const guest = await prisma.guest.findUnique({ where: { id: input.guestId } });
    if (!guest) return { ok: false, error: "guest not found" };
    await assertHotelOwnership(guest.hotelId);

    const data: { notes?: string | null; tags?: string[] } = {};
    if (input.notes !== undefined) {
      const v = input.notes?.trim() ?? "";
      if (v.length > 4000) return { ok: false, error: "notes too long (max 4000)" };
      data.notes = v.length === 0 ? null : v;
    }
    if (input.tags !== undefined && input.tags !== null) {
      const cleaned = input.tags
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length <= 40);
      // De-dupe (case-insensitive) while preserving the user's casing on first occurrence.
      const seen = new Set<string>();
      const unique = cleaned.filter((t) => {
        const k = t.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (unique.length > 20) return { ok: false, error: "too many tags (max 20)" };
      data.tags = unique;
    }
    if (Object.keys(data).length === 0) return { ok: false, error: "nothing to update" };

    const updated = await prisma.guest.update({ where: { id: input.guestId }, data });
    safeRevalidate(["/guests", `/guests/${input.guestId}`]);
    return { ok: true, guestId: updated.id, notes: updated.notes, tags: updated.tags };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Privacy / GDPR ─────────────────────────────────────────────────────

import { exportGuestData, type GuestDataExport } from "./queries";

export interface DeletionToggleResult { ok: true; guestId: string; deletionRequestedAt: string | null; }

export async function requestGuestDeletion(guestId: string): Promise<DeletionToggleResult | BulkEditError> {
  try {
    if (!guestId) return { ok: false, error: "guestId required" };
    const g = await prisma.guest.findUnique({ where: { id: guestId } });
    if (!g) return { ok: false, error: "guest not found" };
    await assertHotelOwnership(g.hotelId);
    if (g.deletionRequestedAt) {
      return { ok: true, guestId, deletionRequestedAt: g.deletionRequestedAt.toISOString() };
    }
    const updated = await prisma.guest.update({
      where: { id: guestId },
      data: { deletionRequestedAt: new Date() },
    });
    safeRevalidate(["/settings/privacy", `/guests/${guestId}`]);
    return { ok: true, guestId, deletionRequestedAt: updated.deletionRequestedAt!.toISOString() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function cancelGuestDeletion(guestId: string): Promise<DeletionToggleResult | BulkEditError> {
  try {
    if (!guestId) return { ok: false, error: "guestId required" };
    const g = await prisma.guest.findUnique({ where: { id: guestId } });
    if (!g) return { ok: false, error: "guest not found" };
    await assertHotelOwnership(g.hotelId);
    await prisma.guest.update({ where: { id: guestId }, data: { deletionRequestedAt: null } });
    safeRevalidate(["/settings/privacy", `/guests/${guestId}`]);
    return { ok: true, guestId, deletionRequestedAt: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Hard-delete now (admin override). Cascades through Booking → Event/Request, Thread → Message. */
export async function hardDeleteGuestNow(guestId: string): Promise<{ ok: true; deletedId: string } | BulkEditError> {
  try {
    if (!guestId) return { ok: false, error: "guestId required" };
    const g = await prisma.guest.findUnique({ where: { id: guestId } });
    if (!g) return { ok: false, error: "guest not found" };
    await assertHotelOwnership(g.hotelId);
    // Cascade chains:
    //   Guest → Bookings (no cascade, manual) → BookingEvent/BookingRequest (cascade from Booking)
    //   Guest → Threads (no cascade, manual) → Message (cascade from Thread)
    await prisma.$transaction([
      prisma.message.deleteMany({ where: { thread: { guestId } } }),
      prisma.thread.deleteMany({ where: { guestId } }),
      prisma.booking.deleteMany({ where: { guestId } }),
      prisma.guest.delete({ where: { id: guestId } }),
    ]);
    safeRevalidate(["/settings/privacy", "/bookings", "/", "/messages"]);
    return { ok: true, deletedId: guestId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchGuestDataExport(guestId: string): Promise<GuestDataExport | null> {
  return exportGuestData(guestId);
}

// ─── AI message draft ──────────────────────────────────────────────────

import { activeLlmProvider, draftReply, type DraftReplyInput, type DraftReplyResult } from "./llm";

export interface DraftReplyForThreadInput {
  threadId: string;
  /** Optional tone override; defaults to "friendly". */
  tone?: "friendly" | "formal" | "concise";
}

export interface DraftReplyForThreadResult extends DraftReplyResult {
  /** Echo of the thread id so the client can match the response. */
  threadId: string;
}

/**
 * Drafts a reply for the given thread. Pulls the latest guest message +
 * relevant booking context, hands them to the LLM provider, and returns
 * a draft string the operator reviews before sending.
 *
 * Tenant guard: thread must belong to the current hotel.
 */
export async function draftReplyForThread(input: DraftReplyForThreadInput): Promise<DraftReplyForThreadResult | BulkEditError> {
  try {
    if (!input.threadId) return { ok: false, error: "threadId required" };
    const thread = await prisma.thread.findUnique({
      where: { id: input.threadId },
      include: {
        guest: { select: { name: true, language: true } },
        channel: { select: { type: true } },
        hotel: { select: { name: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    });
    if (!thread) return { ok: false, error: "thread not found" };
    await assertHotelOwnership(thread.hotelId);

    // Find the most recent guest message — that's what we're replying to.
    const lastGuest = thread.messages.find((m) => m.sender === "guest");
    if (!lastGuest) {
      return { ok: false, error: "no guest message to reply to" };
    }

    // Optional booking context: most recent active booking on this thread.
    const ctxBooking = await prisma.booking.findFirst({
      where: { hotelId: thread.hotelId, guestId: thread.guestId, status: { not: "cancelled" } },
      orderBy: { checkIn: "desc" },
      include: { roomType: { select: { name: true } } },
    });

    const llmInput: DraftReplyInput = {
      hotelName: thread.hotel.name,
      guestName: thread.guest.name,
      language: thread.guest.language ?? "ko",
      lastMessage: lastGuest.body,
      tone: input.tone,
      context: ctxBooking
        ? {
            checkIn: ctxBooking.checkIn.toISOString().slice(0, 10),
            checkOut: ctxBooking.checkOut.toISOString().slice(0, 10),
            roomType: ctxBooking.roomType.name,
            channel: thread.channel?.type,
          }
        : undefined,
    };
    const r = await draftReply(llmInput);
    return { ...r, threadId: input.threadId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Read-only — surface which provider is wired so the UI can label drafts. */
export async function getLlmProviderInfo(): Promise<{ provider: "anthropic" | "openai" | "mock" }> {
  return { provider: activeLlmProvider() };
}

// ─── Room state (housekeeping) ─────────────────────────────────────────

import { RoomState } from "@prisma/client";

export interface SetRoomStateInput {
  roomId: string;
  state: RoomState;
  note?: string | null;
}

export async function setRoomState(input: SetRoomStateInput): Promise<{ ok: true; state: RoomState } | BulkEditError> {
  try {
    if (!input.roomId) return { ok: false, error: "roomId required" };
    const room = await prisma.room.findUnique({ where: { id: input.roomId }, include: { roomType: true } });
    if (!room) return { ok: false, error: "room not found" };
    await assertHotelOwnership(room.roomType.hotelId);
    // Note length cap — housekeeping snippets, not essays.
    const note = input.note?.trim().slice(0, 200) ?? null;
    await prisma.room.update({
      where: { id: input.roomId },
      data: { state: input.state, stateNote: note, stateAt: new Date() },
    });
    safeRevalidate(["/housekeeping", "/calendar", "/"]);
    return { ok: true, state: input.state };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Self-check-in kiosk ───────────────────────────────────────────────

import { randomBytes } from "crypto";
import { BookingStatus as BookingStatusEnum } from "@prisma/client";

export interface IssueCheckinTokenResult {
  ok: true;
  token: string;
  /** Full URL the staff can text/email the guest. Honors NEXT_PUBLIC_APP_URL. */
  url: string;
  expiresAt: string;
}

/**
 * Mints (or reuses) a single-use kiosk token for a booking. Idempotent —
 * regenerates only when the existing token is expired or already used.
 */
export async function issueCheckinToken(bookingId: string): Promise<IssueCheckinTokenResult | BulkEditError> {
  try {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return { ok: false, error: "booking not found" };
    await assertHotelOwnership(booking.hotelId);

    const existing = await prisma.checkinToken.findUnique({ where: { bookingId } });
    const now = new Date();
    const reuseable = existing && !existing.completedAt && existing.expiresAt > now;
    let token: string;
    let expiresAt: Date;
    if (reuseable && existing) {
      token = existing.token;
      expiresAt = existing.expiresAt;
    } else {
      token = randomBytes(12).toString("base64url"); // 16 chars
      // Expire 7 days from now OR 1 day after checkout (whichever is later).
      const minExpiry = new Date(now.getTime() + 7 * 86_400_000);
      const checkoutBuffer = new Date(booking.checkOut.getTime() + 86_400_000);
      expiresAt = checkoutBuffer > minExpiry ? checkoutBuffer : minExpiry;
      if (existing) {
        await prisma.checkinToken.update({
          where: { bookingId },
          data: { token, expiresAt, completedAt: null, idPhotoUrl: null, arrivalEta: null },
        });
      } else {
        await prisma.checkinToken.create({ data: { bookingId, token, expiresAt } });
      }
    }
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? "";
    return { ok: true, token, url: `${origin}/k/checkin/${token}`, expiresAt: expiresAt.toISOString() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface KioskBookingPreview {
  /** Hotel name + logo for the kiosk header. */
  hotel: { name: string; logoUrl: string | null };
  guest: { name: string; country: string | null };
  bookingRef: string | null;
  roomType: string;
  roomNumber: string | null;
  checkIn: string;
  checkOut: string;
  /** Whether the kiosk has already been completed — UI shows "thanks" view. */
  alreadyCompletedAt: string | null;
  /** Echo back so the page knows whether to show the upload form. */
  hasIdPhoto: boolean;
  arrivalEta: string | null;
}

/**
 * Resolves a kiosk token → booking preview. Public — no tenant guard,
 * relies on the unguessable token. Returns null when the token is invalid
 * / expired / for a cancelled booking.
 */
export async function getKioskBookingByToken(token: string): Promise<KioskBookingPreview | null> {
  if (!token || token.length < 4) return null;
  const row = await prisma.checkinToken.findUnique({
    where: { token },
    include: {
      booking: {
        include: {
          hotel: { select: { name: true, logoUrl: true } },
          guest: { select: { name: true, country: true } },
          roomType: { select: { name: true } },
          room: { select: { number: true } },
        },
      },
    },
  });
  if (!row) return null;
  if (row.expiresAt < new Date()) return null;
  if (row.booking.status === "cancelled") return null;
  return {
    hotel: { name: row.booking.hotel.name, logoUrl: row.booking.hotel.logoUrl },
    guest: { name: row.booking.guest.name, country: row.booking.guest.country },
    bookingRef: row.booking.externalRef,
    roomType: row.booking.roomType.name,
    roomNumber: row.booking.room?.number ?? null,
    checkIn: row.booking.checkIn.toISOString().slice(0, 10),
    checkOut: row.booking.checkOut.toISOString().slice(0, 10),
    alreadyCompletedAt: row.completedAt?.toISOString() ?? null,
    hasIdPhoto: !!row.idPhotoUrl,
    arrivalEta: row.arrivalEta,
  };
}

export interface SubmitSelfCheckinInput {
  token: string;
  /** Data: URL or S3 URL captured from the kiosk's <input type="file">. */
  idPhotoUrl: string;
  /** HH:MM 24h KST. */
  arrivalEta: string;
}

export interface SubmitSelfCheckinResult {
  ok: true;
  hotelName: string;
  roomNumber: string | null;
}

export async function submitSelfCheckin(input: SubmitSelfCheckinInput): Promise<SubmitSelfCheckinResult | BulkEditError> {
  try {
    if (!input.token) return { ok: false, error: "token required" };
    if (!input.idPhotoUrl) return { ok: false, error: "ID photo required" };
    if (!/^\d{2}:\d{2}$/.test(input.arrivalEta)) return { ok: false, error: "arrivalEta must be HH:MM" };
    const row = await prisma.checkinToken.findUnique({
      where: { token: input.token },
      include: { booking: { include: { hotel: { select: { name: true } }, room: { select: { number: true } } } } },
    });
    if (!row) return { ok: false, error: "token not found" };
    if (row.expiresAt < new Date()) return { ok: false, error: "token expired" };
    if (row.completedAt) return { ok: false, error: "already completed" };
    if (row.booking.status === "cancelled") return { ok: false, error: "booking cancelled" };

    const now = new Date();
    await prisma.$transaction([
      prisma.checkinToken.update({
        where: { token: input.token },
        data: { idPhotoUrl: input.idPhotoUrl, arrivalEta: input.arrivalEta, completedAt: now },
      }),
      // Auto-flip to in_house when staff hasn't already done it.
      ...(row.booking.status === BookingStatusEnum.confirmed
        ? [prisma.booking.update({ where: { id: row.bookingId }, data: { status: BookingStatusEnum.in_house } })]
        : []),
      prisma.bookingEvent.create({
        data: {
          bookingId: row.bookingId,
          type: BookingEventType.self_check_in,
          occurredAt: now,
          body: `kiosk · ETA ${input.arrivalEta}`,
        },
      }),
    ]);

    safeRevalidate(["/bookings", "/", "/calendar"]);
    return { ok: true, hotelName: row.booking.hotel.name, roomNumber: row.booking.room?.number ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Saved filters ─────────────────────────────────────────────────────

import { SavedFilterScope } from "@prisma/client";

export interface CreateSavedFilterInput {
  scope: SavedFilterScope;
  label: string;
  icon?: string | null;
  params: Record<string, string>;
}

export async function createSavedFilter(input: CreateSavedFilterInput): Promise<{ ok: true; id: string } | BulkEditError> {
  try {
    const label = input.label.trim();
    if (!label) return { ok: false, error: "label required" };
    if (label.length > 60) return { ok: false, error: "label too long" };
    // Drop empty params so the saved URL is clean.
    const params = Object.fromEntries(
      Object.entries(input.params).filter(([, v]) => v != null && v !== ""),
    );
    if (Object.keys(params).length === 0) return { ok: false, error: "filter has no params" };
    if (Object.keys(params).length > 10) return { ok: false, error: "too many params (max 10)" };
    const hotelId = await currentHotelId();
    const row = await prisma.savedFilter.create({
      data: {
        hotelId,
        scope: input.scope,
        label,
        icon: input.icon?.slice(0, 4) ?? null,
        params,
      },
    });
    safeRevalidate(["/bookings", "/messages", "/"]);
    return { ok: true, id: row.id };
  } catch (e) {
    // Unique constraint violation reads as a friendlier message
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint")) return { ok: false, error: "label already exists for this scope" };
    return { ok: false, error: msg };
  }
}

export async function deleteSavedFilter(id: string): Promise<{ ok: true } | BulkEditError> {
  try {
    const row = await prisma.savedFilter.findUnique({ where: { id } });
    if (!row) return { ok: false, error: "not found" };
    await assertHotelOwnership(row.hotelId);
    await prisma.savedFilter.delete({ where: { id } });
    safeRevalidate(["/bookings", "/messages"]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Bumps `hitCount` when a saved filter is opened. Useful for sorting by
 * usage later. Fire-and-forget from the UI — failure is harmless.
 */
export async function bumpSavedFilter(id: string): Promise<{ ok: true } | BulkEditError> {
  try {
    const row = await prisma.savedFilter.findUnique({ where: { id } });
    if (!row) return { ok: false, error: "not found" };
    await assertHotelOwnership(row.hotelId);
    await prisma.savedFilter.update({ where: { id }, data: { hitCount: { increment: 1 } } });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Outbound integrations (Slack / Discord) ───────────────────────────

import { dispatchIntegrationEvent, pingWebhook } from "./integrations";
import { IntegrationEvent, IntegrationProvider } from "@prisma/client";

const ALLOWED_INTEGRATION_EVENTS = new Set<IntegrationEvent>([
  IntegrationEvent.booking_created,
  IntegrationEvent.booking_cancelled,
  IntegrationEvent.payment_failed,
  IntegrationEvent.warning_digest,
]);

function validateWebhookUrl(provider: IntegrationProvider, url: string): string | null {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return "invalid URL"; }
  if (parsed.protocol !== "https:") return "URL must use https";
  if (provider === "slack" && !parsed.host.endsWith("hooks.slack.com")) return "expected hooks.slack.com";
  if (provider === "discord" && !parsed.host.endsWith("discord.com") && !parsed.host.endsWith("discordapp.com")) {
    return "expected discord.com webhook URL";
  }
  return null;
}

export interface CreateIntegrationInput {
  provider: IntegrationProvider;
  label: string;
  webhookUrl: string;
  events: IntegrationEvent[];
}

export async function createOutboundIntegration(input: CreateIntegrationInput): Promise<{ ok: true; id: string } | BulkEditError> {
  try {
    const label = input.label.trim();
    if (!label) return { ok: false, error: "label required" };
    if (label.length > 60) return { ok: false, error: "label too long" };
    const urlErr = validateWebhookUrl(input.provider, input.webhookUrl);
    if (urlErr) return { ok: false, error: urlErr };
    const events = input.events.filter((e) => ALLOWED_INTEGRATION_EVENTS.has(e));
    if (events.length === 0) return { ok: false, error: "at least one event required" };
    const hotelId = await currentHotelId();
    const row = await prisma.outboundIntegration.create({
      data: { hotelId, provider: input.provider, label, webhookUrl: input.webhookUrl, events, enabled: true },
    });
    safeRevalidate(["/settings/integrations", "/settings"]);
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteOutboundIntegration(id: string): Promise<{ ok: true } | BulkEditError> {
  try {
    const row = await prisma.outboundIntegration.findUnique({ where: { id } });
    if (!row) return { ok: false, error: "not found" };
    await assertHotelOwnership(row.hotelId);
    await prisma.outboundIntegration.delete({ where: { id } });
    safeRevalidate(["/settings/integrations"]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function toggleOutboundIntegration(id: string, enabled: boolean): Promise<{ ok: true } | BulkEditError> {
  try {
    const row = await prisma.outboundIntegration.findUnique({ where: { id } });
    if (!row) return { ok: false, error: "not found" };
    await assertHotelOwnership(row.hotelId);
    await prisma.outboundIntegration.update({
      where: { id },
      // Reset failureCount when manually re-enabling so the auto-disable
      // doesn't immediately re-trigger.
      data: { enabled, failureCount: enabled ? 0 : row.failureCount },
    });
    safeRevalidate(["/settings/integrations"]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function pingOutboundIntegration(id: string): Promise<{ ok: boolean; status: number; error?: string } | BulkEditError> {
  try {
    const row = await prisma.outboundIntegration.findUnique({ where: { id } });
    if (!row) return { ok: false, error: "not found" };
    await assertHotelOwnership(row.hotelId);
    return await pingWebhook({ provider: row.provider, url: row.webhookUrl, label: row.label });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Onboarding ─────────────────────────────────────────────────────────

export interface CreateFirstRoomTypeInput {
  name: string;
  baseRate: number;
  capacity: number;
  /** When > 0, also creates that many Room records numbered "101", "102", … */
  initialRoomCount?: number;
}

export async function createFirstRoomType(input: CreateFirstRoomTypeInput): Promise<{ ok: true; roomTypeId: string } | BulkEditError> {
  try {
    const name = input.name.trim();
    if (!name) return { ok: false, error: "name required" };
    if (name.length > 80) return { ok: false, error: "name too long" };
    if (input.baseRate <= 0 || !Number.isFinite(input.baseRate)) return { ok: false, error: "baseRate must be positive" };
    if (input.capacity <= 0 || input.capacity > 20) return { ok: false, error: "capacity 1-20" };
    const hotelId = await currentHotelId();
    const rt = await prisma.roomType.create({
      data: { hotelId, name, baseRate: input.baseRate, capacity: input.capacity },
    });
    if (input.initialRoomCount && input.initialRoomCount > 0) {
      const n = Math.min(50, Math.floor(input.initialRoomCount));
      // Numbered 101..(100+n) — matches Korean hotel convention.
      await prisma.room.createMany({
        data: Array.from({ length: n }, (_, i) => ({
          roomTypeId: rt.id,
          number: String(101 + i),
        })),
      });
    }
    safeRevalidate(["/onboarding", "/rooms", "/calendar", "/"]);
    return { ok: true, roomTypeId: rt.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface ConnectFirstChannelInput {
  type: ChannelType;
}

export async function connectFirstChannel(input: ConnectFirstChannelInput): Promise<{ ok: true; channelId: string } | BulkEditError> {
  try {
    const hotelId = await currentHotelId();
    // Idempotent: same (hotelId, type) pair won't be created twice (DB unique).
    const existing = await prisma.channel.findFirst({ where: { hotelId, type: input.type } });
    if (existing) return { ok: true, channelId: existing.id };
    const channel = await prisma.channel.create({
      data: { hotelId, type: input.type, status: ChannelStatus.synced },
    });
    safeRevalidate(["/onboarding", "/channels", "/"]);
    return { ok: true, channelId: channel.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function completeOnboarding(): Promise<{ ok: true } | BulkEditError> {
  try {
    const hotelId = await currentHotelId();
    await prisma.hotel.update({
      where: { id: hotelId },
      data: { onboardingCompletedAt: new Date() },
    });
    safeRevalidate(["/onboarding", "/", "/settings"]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Room conflict resolution ──────────────────────────────────────────

import { getRoomConflicts, type RoomConflictRow } from "./queries";

export interface AssignRoomResult { ok: true; bookingId: string; roomId: string | null; }

/**
 * Re-assigns or clears the room on a booking. Verifies (1) the booking belongs
 * to the current tenant and (2) — when assigning — that the new room is the
 * same room type as the booking, free for the booking's window, and belongs
 * to the same hotel. Pass `roomId: null` to unassign.
 */
export async function assignBookingRoom(bookingId: string, roomId: string | null): Promise<AssignRoomResult | BulkEditError> {
  try {
    if (!bookingId) return { ok: false, error: "bookingId required" };
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, hotelId: true, roomTypeId: true, checkIn: true, checkOut: true },
    });
    if (!booking) return { ok: false, error: "booking not found" };
    await assertHotelOwnership(booking.hotelId);

    if (roomId !== null) {
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        select: { id: true, roomTypeId: true, roomType: { select: { hotelId: true } } },
      });
      if (!room) return { ok: false, error: "room not found" };
      if (room.roomType.hotelId !== booking.hotelId) {
        return { ok: false, error: "room belongs to a different hotel" };
      }
      if (room.roomTypeId !== booking.roomTypeId) {
        return { ok: false, error: "room is a different room type than the booking" };
      }
      // Window-free check: any other active booking on the same room overlapping this window?
      const overlap = await prisma.booking.findFirst({
        where: {
          id: { not: bookingId },
          roomId,
          status: { in: ["confirmed", "in_house"] },
          AND: [
            { checkIn: { lt: booking.checkOut } },
            { checkOut: { gt: booking.checkIn } },
          ],
        },
        select: { id: true },
      });
      if (overlap) return { ok: false, error: "room already occupied in this window" };
    }

    await prisma.booking.update({ where: { id: bookingId }, data: { roomId } });
    safeRevalidate(["/bookings", "/calendar", "/"]);
    return { ok: true, bookingId, roomId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchRoomConflicts(): Promise<RoomConflictRow[]> {
  return getRoomConflicts();
}

// ─── SaaS subscription billing ─────────────────────────────────────────

import { listPlans, planById, type SubscriptionState, getSubscriptionState } from "./billing";
import { SubscriptionPlan } from "@prisma/client";

export interface BillingCheckoutResult {
  ok: true;
  url: string;
  /** True when no Stripe creds are configured — UI can show a "(mock)" hint. */
  mock: boolean;
}

/** Create a Stripe Checkout session for the chosen plan, or return a mock URL when Stripe is unconfigured. */
export async function startSubscriptionCheckout(plan: SubscriptionPlan): Promise<BillingCheckoutResult | BulkEditError> {
  try {
    const planDef = planById(plan);
    if (!planDef) return { ok: false, error: `unknown plan: ${plan}` };
    const hotelId = await currentHotelId();
    const hotel = await prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });

    if (!stripeEnabled || !planDef.stripePriceId) {
      // Mock: pretend the checkout succeeded immediately so devs can test the
      // post-checkout flow without real Stripe. We mark the hotel `active` and
      // set a fake currentPeriodEndsAt = 30 days out.
      await prisma.hotel.update({
        where: { id: hotelId },
        data: {
          plan,
          subscriptionStatus: "active",
          currentPeriodEndsAt: new Date(Date.now() + 30 * 86_400_000),
        },
      });
      safeRevalidate(["/settings/billing", "/settings", "/"]);
      return { ok: true, url: "/settings/billing?mock=success", mock: true };
    }

    const stripe = getStripe();
    const headerList = await headers();
    const proto = headerList.get("x-forwarded-proto") ?? "http";
    const host = headerList.get("host") ?? "localhost:3000";
    const origin = `${proto}://${host}`;

    let customerId = hotel.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: hotel.name,
        metadata: { hotelId },
      });
      customerId = customer.id;
      await prisma.hotel.update({ where: { id: hotelId }, data: { stripeCustomerId: customerId } });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: planDef.stripePriceId, quantity: 1 }],
      success_url: `${origin}/settings/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/settings/billing?cancelled=1`,
      metadata: { hotelId, plan },
      subscription_data: { metadata: { hotelId, plan } },
    });
    if (!session.url) return { ok: false, error: "stripe returned no url" };
    return { ok: true, url: session.url, mock: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface BillingPortalResult { ok: true; url: string; mock: boolean; }

export async function openBillingPortal(): Promise<BillingPortalResult | BulkEditError> {
  try {
    const hotelId = await currentHotelId();
    const hotel = await prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    if (!stripeEnabled || !hotel.stripeCustomerId) {
      return { ok: true, url: "/settings/billing?mock=portal", mock: true };
    }
    const stripe = getStripe();
    const headerList = await headers();
    const proto = headerList.get("x-forwarded-proto") ?? "http";
    const host = headerList.get("host") ?? "localhost:3000";
    const session = await stripe.billingPortal.sessions.create({
      customer: hotel.stripeCustomerId,
      return_url: `${proto}://${host}/settings/billing`,
    });
    return { ok: true, url: session.url, mock: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Re-export thin wrappers for the billing settings page (server-side reads only — no auth needed). */
export async function fetchBillingState(): Promise<SubscriptionState> {
  const hotelId = await currentHotelId();
  return getSubscriptionState(hotelId);
}

export async function fetchPlans(): Promise<ReturnType<typeof listPlans>> {
  return listPlans();
}

// ─── Owner iCal feed ───────────────────────────────────────────────────

export interface OwnerICalToken {
  ok: true;
  token: string | null;
  /** Resolved feed URL (when token exists). Empty string when no token. */
  url: string;
}

export async function getOrCreateOwnerICalToken(): Promise<OwnerICalToken | BulkEditError> {
  try {
    const hotelId = await currentHotelId();
    let hotel = await prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    if (!hotel.ownerICalToken) {
      const tok = randomBytes(24).toString("base64url");
      hotel = await prisma.hotel.update({
        where: { id: hotelId },
        data: { ownerICalToken: tok },
      });
    }
    return {
      ok: true,
      token: hotel.ownerICalToken,
      url: hotel.ownerICalToken ? `/api/ical/hotel/${hotel.ownerICalToken}.ics` : "",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function rotateOwnerICalToken(): Promise<OwnerICalToken | BulkEditError> {
  try {
    const hotelId = await currentHotelId();
    const tok = randomBytes(24).toString("base64url");
    const hotel = await prisma.hotel.update({
      where: { id: hotelId },
      data: { ownerICalToken: tok },
    });
    safeRevalidate(["/settings"]);
    return { ok: true, token: hotel.ownerICalToken, url: `/api/ical/hotel/${tok}.ics` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function revokeOwnerICalToken(): Promise<{ ok: true } | BulkEditError> {
  try {
    const hotelId = await currentHotelId();
    await prisma.hotel.update({ where: { id: hotelId }, data: { ownerICalToken: null } });
    safeRevalidate(["/settings"]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Hotel info ────────────────────────────────────────────────────────

export interface UpdateHotelInfoInput {
  name?: string;
  timezone?: string;
  currency?: string;
}

export interface UpdateHotelInfoResult {
  ok: true;
  hotel: { id: string; name: string; timezone: string; currency: string };
}

const ALLOWED_CURRENCIES = new Set(["KRW", "USD", "EUR", "JPY", "GBP", "CNY"]);
const ALLOWED_TZ = new Set([
  "Asia/Seoul", "Asia/Tokyo", "Asia/Shanghai", "Asia/Singapore", "Asia/Bangkok",
  "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles", "UTC",
]);

export async function updateHotelInfo(
  input: UpdateHotelInfoInput,
): Promise<UpdateHotelInfoResult | BulkEditError> {
  try {
    const hotelId = await currentHotelId();
    const data: { name?: string; timezone?: string; currency?: string } = {};
    if (typeof input.name === "string") {
      const trimmed = input.name.trim();
      if (trimmed.length === 0) return { ok: false, error: "name cannot be empty" };
      if (trimmed.length > 80) return { ok: false, error: "name too long (max 80)" };
      data.name = trimmed;
    }
    if (typeof input.timezone === "string") {
      if (!ALLOWED_TZ.has(input.timezone)) return { ok: false, error: `unsupported timezone: ${input.timezone}` };
      data.timezone = input.timezone;
    }
    if (typeof input.currency === "string") {
      if (!ALLOWED_CURRENCIES.has(input.currency)) return { ok: false, error: `unsupported currency: ${input.currency}` };
      data.currency = input.currency;
    }
    if (Object.keys(data).length === 0) return { ok: false, error: "nothing to update" };

    const updated = await prisma.hotel.update({ where: { id: hotelId }, data });
    safeRevalidate(["/settings", "/"]);
    return {
      ok: true,
      hotel: { id: updated.id, name: updated.name, timezone: updated.timezone, currency: updated.currency },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
