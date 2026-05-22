import "server-only";
import { prisma } from "./db";
import { ChannelType, BookingStatus, PaymentStatus } from "@prisma/client";

/**
 * CSV import for migrating from another PMS.
 *
 * Two import kinds: "guests" and "bookings". Both share a parser that's
 * tolerant of:
 *   - quoted fields with embedded commas / quotes (RFC 4180)
 *   - UTF-8 BOM (Excel exports it by default)
 *   - mixed line endings (\r\n, \n)
 *
 * Flow:
 *   1. UI parses the file locally and shows a preview + suggested mapping.
 *   2. UI calls `dryRunImport()` → server validates each row, returns errors
 *      + dedupe stats. Nothing written.
 *   3. User confirms → `commitImport()` runs; idempotent via natural keys
 *      (guest.email or externalRef for bookings).
 *
 * Dedupe strategy:
 *   - guests: key = (hotelId, lowercase email). Existing row is updated.
 *   - bookings: key = (hotelId, externalRef). Existing row is skipped — we
 *     never overwrite booking data through CSV (use the modify flow instead).
 */

export type ImportKind = "guests" | "bookings";

/** Column name → user-mapped CSV header. Empty string = unmapped. */
export type ColumnMapping = Record<string, string>;

export const GUEST_FIELDS = ["name", "email", "phone", "country", "language"] as const;
export const BOOKING_FIELDS = [
  "guestName",
  "guestEmail",
  "guestCountry",
  "channel",        // ChannelType string (airbnb/booking/...)
  "roomTypeName",
  "checkIn",        // YYYY-MM-DD
  "checkOut",       // YYYY-MM-DD
  "total",          // KRW integer
  "externalRef",    // optional natural key
  "status",         // optional: confirmed/in_house/checked_out/cancelled
  "payment",        // optional: paid/pending/failed/refunded
] as const;

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** Strict-ish CSV parser. Handles quotes, escaped quotes, CRLF, BOM. */
export function parseCsv(text: string): ParsedCsv {
  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } // escaped quote
        else { inQuotes = false; }
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ",") { row.push(cell); cell = ""; continue; }
    if (c === "\n") {
      row.push(cell); cell = "";
      out.push(row); row = [];
      continue;
    }
    if (c === "\r") {
      // Look ahead to consume the \n in \r\n
      if (text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      out.push(row); row = [];
      continue;
    }
    cell += c;
  }
  // Trailing cell / row
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    out.push(row);
  }
  // Drop fully-empty trailing rows
  while (out.length > 0 && out[out.length - 1].every((c) => c.trim() === "")) {
    out.pop();
  }
  if (out.length === 0) return { headers: [], rows: [] };
  return { headers: out[0].map((h) => h.trim()), rows: out.slice(1) };
}

export interface ImportRowError {
  rowIdx: number;
  message: string;
}

export interface ImportSummary {
  /** Rows that would be created. */
  toCreate: number;
  /** Rows that would update an existing record (e.g. dedupe by email). */
  toUpdate: number;
  /** Rows that would be skipped (e.g. booking already ingested). */
  toSkip: number;
  errors: ImportRowError[];
  /** First N errors are surfaced inline; full list available via errors. */
  preview: { rowIdx: number; data: Record<string, string> }[];
}

interface ImportInput {
  kind: ImportKind;
  csv: string;
  mapping: ColumnMapping;
  /** When true, no DB writes — just validate + diff against existing records. */
  dryRun: boolean;
}

function pickValue(row: string[], headers: string[], mapping: ColumnMapping, field: string): string {
  const header = mapping[field];
  if (!header) return "";
  const idx = headers.indexOf(header);
  return idx >= 0 ? (row[idx] ?? "").trim() : "";
}

const VALID_CHANNELS = new Set<string>(["airbnb", "booking", "agoda", "trip", "direct", "fb", "yanolja", "naver"]);
const VALID_BOOKING_STATUSES = new Set<string>(["confirmed", "in_house", "checked_out", "cancelled"]);
const VALID_PAYMENTS = new Set<string>(["paid", "pending", "failed", "refunded"]);

export async function runImport(input: ImportInput): Promise<ImportSummary & { ok: true } | { ok: false; error: string }> {
  try {
    const { kind, csv, mapping, dryRun } = input;
    const parsed = parseCsv(csv);
    if (parsed.headers.length === 0) return { ok: false, error: "empty CSV" };
    if (parsed.rows.length === 0) return { ok: false, error: "no data rows" };
    if (parsed.rows.length > 5000) return { ok: false, error: "too many rows (max 5000 per import)" };

    // Tenant scope is enforced inside the actions caller. The library doesn't
    // know the hotelId — we accept it via mapping or fall back to the active
    // currentHotelId at the action layer (see actions.ts).
    return kind === "guests"
      ? await importGuests(parsed, mapping, dryRun)
      : await importBookings(parsed, mapping, dryRun);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function importGuests(parsed: ParsedCsv, mapping: ColumnMapping, dryRun: boolean): Promise<ImportSummary & { ok: true }> {
  const errors: ImportRowError[] = [];
  const preview: ImportSummary["preview"] = [];
  let toCreate = 0;
  let toUpdate = 0;
  const toSkip = 0;

  // Required: name OR email — we need at least one to make a useful row.
  const hotelId = mapping["__hotelId"];
  if (!hotelId) throw new Error("internal: hotelId not provided");

  // Pre-load existing emails for fast dedupe
  const existingEmails = new Map<string, string>(); // email-lower → guestId
  const existing = await prisma.guest.findMany({ where: { hotelId, NOT: { email: null } }, select: { id: true, email: true } });
  for (const g of existing) {
    if (g.email) existingEmails.set(g.email.toLowerCase(), g.id);
  }

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const data = {
      name: pickValue(row, parsed.headers, mapping, "name"),
      email: pickValue(row, parsed.headers, mapping, "email"),
      phone: pickValue(row, parsed.headers, mapping, "phone"),
      country: pickValue(row, parsed.headers, mapping, "country").toUpperCase().slice(0, 2) || null,
      language: pickValue(row, parsed.headers, mapping, "language").toLowerCase().slice(0, 2) || null,
    };
    if (!data.name && !data.email) {
      errors.push({ rowIdx: i + 2, message: "name or email required" });
      continue;
    }
    if (data.email && !data.email.includes("@")) {
      errors.push({ rowIdx: i + 2, message: `invalid email: ${data.email}` });
      continue;
    }
    if (preview.length < 5) preview.push({ rowIdx: i + 2, data: data as Record<string, string> });

    const existingId = data.email ? existingEmails.get(data.email.toLowerCase()) : undefined;
    if (existingId) {
      toUpdate++;
      if (!dryRun) {
        await prisma.guest.update({
          where: { id: existingId },
          data: {
            name: data.name || undefined,
            phone: data.phone || undefined,
            country: data.country,
            language: data.language,
          },
        });
      }
    } else {
      toCreate++;
      if (!dryRun) {
        const created = await prisma.guest.create({
          data: {
            hotelId,
            name: data.name || data.email!.split("@")[0],
            email: data.email || null,
            phone: data.phone || null,
            country: data.country,
            language: data.language,
          },
        });
        if (data.email) existingEmails.set(data.email.toLowerCase(), created.id);
      }
    }
  }
  return { ok: true, toCreate, toUpdate, toSkip, errors, preview };
}

async function importBookings(parsed: ParsedCsv, mapping: ColumnMapping, dryRun: boolean): Promise<ImportSummary & { ok: true }> {
  const errors: ImportRowError[] = [];
  const preview: ImportSummary["preview"] = [];
  let toCreate = 0;
  const toUpdate = 0;
  let toSkip = 0;

  const hotelId = mapping["__hotelId"];
  if (!hotelId) throw new Error("internal: hotelId not provided");

  // Pre-load room types + channels for in-memory match
  const [roomTypes, channels, existingExternalRefs] = await Promise.all([
    prisma.roomType.findMany({ where: { hotelId }, select: { id: true, name: true } }),
    prisma.channel.findMany({ where: { hotelId }, select: { id: true, type: true } }),
    prisma.booking.findMany({ where: { hotelId, NOT: { externalRef: null } }, select: { externalRef: true } }),
  ]);
  const rtByLower = new Map(roomTypes.map((r) => [r.name.toLowerCase(), r.id]));
  const channelByType = new Map(channels.map((c) => [c.type, c.id]));
  const seenRefs = new Set(existingExternalRefs.map((b) => b.externalRef!));
  const seenInBatch = new Set<string>();

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const guestName = pickValue(row, parsed.headers, mapping, "guestName");
    const guestEmail = pickValue(row, parsed.headers, mapping, "guestEmail");
    const guestCountry = pickValue(row, parsed.headers, mapping, "guestCountry").toUpperCase().slice(0, 2) || null;
    const channelStr = pickValue(row, parsed.headers, mapping, "channel").toLowerCase() || "direct";
    const roomTypeName = pickValue(row, parsed.headers, mapping, "roomTypeName");
    const checkIn = pickValue(row, parsed.headers, mapping, "checkIn");
    const checkOut = pickValue(row, parsed.headers, mapping, "checkOut");
    const totalRaw = pickValue(row, parsed.headers, mapping, "total");
    const externalRef = pickValue(row, parsed.headers, mapping, "externalRef");
    const statusStr = (pickValue(row, parsed.headers, mapping, "status") || "confirmed").toLowerCase();
    const paymentStr = (pickValue(row, parsed.headers, mapping, "payment") || "paid").toLowerCase();

    const data = { guestName, guestEmail, channelStr, roomTypeName, checkIn, checkOut, totalRaw, externalRef, statusStr, paymentStr };
    if (preview.length < 5) preview.push({ rowIdx: i + 2, data });

    if (!guestName) { errors.push({ rowIdx: i + 2, message: "guestName required" }); continue; }
    if (!roomTypeName) { errors.push({ rowIdx: i + 2, message: "roomTypeName required" }); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) { errors.push({ rowIdx: i + 2, message: `invalid checkIn: ${checkIn}` }); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) { errors.push({ rowIdx: i + 2, message: `invalid checkOut: ${checkOut}` }); continue; }
    if (!VALID_CHANNELS.has(channelStr)) { errors.push({ rowIdx: i + 2, message: `unknown channel: ${channelStr}` }); continue; }
    if (!VALID_BOOKING_STATUSES.has(statusStr)) { errors.push({ rowIdx: i + 2, message: `invalid status: ${statusStr}` }); continue; }
    if (!VALID_PAYMENTS.has(paymentStr)) { errors.push({ rowIdx: i + 2, message: `invalid payment: ${paymentStr}` }); continue; }
    const total = totalRaw ? parseInt(totalRaw.replace(/[^\d-]/g, ""), 10) : 0;
    if (!Number.isFinite(total) || total < 0) { errors.push({ rowIdx: i + 2, message: `invalid total: ${totalRaw}` }); continue; }

    const rtId = rtByLower.get(roomTypeName.toLowerCase());
    if (!rtId) { errors.push({ rowIdx: i + 2, message: `unmapped roomType: ${roomTypeName}` }); continue; }
    const channelId = channelByType.get(channelStr as ChannelType);
    if (!channelId) { errors.push({ rowIdx: i + 2, message: `channel not configured: ${channelStr}` }); continue; }

    // Dedupe by externalRef (across DB + within-batch)
    if (externalRef) {
      if (seenRefs.has(externalRef) || seenInBatch.has(externalRef)) {
        toSkip++;
        continue;
      }
      seenInBatch.add(externalRef);
    }

    toCreate++;
    if (!dryRun) {
      // Resolve / create guest by email when present, else by name within hotel
      let guestId: string;
      const existingGuest = guestEmail
        ? await prisma.guest.findFirst({ where: { hotelId, email: { equals: guestEmail, mode: "insensitive" } } })
        : await prisma.guest.findFirst({ where: { hotelId, name: guestName } });
      if (existingGuest) {
        guestId = existingGuest.id;
      } else {
        const created = await prisma.guest.create({
          data: { hotelId, name: guestName, email: guestEmail || null, country: guestCountry },
        });
        guestId = created.id;
      }
      await prisma.booking.create({
        data: {
          hotelId,
          guestId,
          channelId,
          roomTypeId: rtId,
          externalRef: externalRef || null,
          status: statusStr as BookingStatus,
          payment: paymentStr as PaymentStatus,
          checkIn: new Date(`${checkIn}T00:00:00Z`),
          checkOut: new Date(`${checkOut}T00:00:00Z`),
          total,
          events: { create: [{ type: "created", occurredAt: new Date(), body: "csv-import" }] },
        },
      });
      if (externalRef) seenRefs.add(externalRef);
    }
  }
  return { ok: true, toCreate, toUpdate, toSkip, errors, preview };
}
