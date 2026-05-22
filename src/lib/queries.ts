import "server-only";
import type {
  BookingStatus,
  PaymentStatus,
  BookingRequestType,
  BookingEventType,
  ChannelStatus as PrismaChannelStatus,
  SyncOp,
  SyncResult,
  ChannelType,
  MessageSender,
  MiddlewareStatus,
  MiddlewareType,
} from "@prisma/client";
import { prisma } from "./db";
import { currentHotelId } from "./tenant";
import { competitorAvgRate, eventFor, eventsInRange, type EventCategory } from "./market";
import type { ChannelId } from "./i18n";

const COUNTRY_FLAGS: Record<string, string> = {
  KR: "🇰🇷",
  JP: "🇯🇵",
  CN: "🇨🇳",
  US: "🇺🇸",
  DE: "🇩🇪",
  SE: "🇸🇪",
  TW: "🇹🇼",
  GB: "🇬🇧",
  FR: "🇫🇷",
};

const COUNTRY_NAMES: Record<string, { ko: string; en: string }> = {
  KR: { ko: "한국", en: "Korea" },
  JP: { ko: "일본", en: "Japan" },
  CN: { ko: "중국", en: "China" },
  US: { ko: "미국", en: "USA" },
  DE: { ko: "독일", en: "Germany" },
  SE: { ko: "스웨덴", en: "Sweden" },
  TW: { ko: "대만", en: "Taiwan" },
  GB: { ko: "영국", en: "UK" },
  FR: { ko: "프랑스", en: "France" },
};

const SUPPORTED_CHANNELS = new Set<string>(["airbnb", "booking", "agoda", "trip", "direct", "fb"]);

function asChannelId(t: ChannelType | string | null | undefined): ChannelId {
  return SUPPORTED_CHANNELS.has(String(t)) ? (t as ChannelId) : "direct";
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

// ─── Dashboard ───────────────────────────────────────────────────────────

export interface ArrivalRow {
  id: string;
  name: string;
  channel: ChannelId;
  nights: number;
  flag: string;
  total: number;
}

export async function getTodayArrivals(limit = 8): Promise<ArrivalRow[]> {
  const hotelId = await currentHotelId();
  const today = startOfTodayUtc();
  const tomorrow = addDays(today, 1);

  const rows = await prisma.booking.findMany({
    where: { hotelId, status: "confirmed", checkIn: { gte: today, lt: tomorrow } },
    include: { guest: true, channel: true },
    orderBy: { checkIn: "asc" },
    take: limit,
  });

  return rows.map((b) => {
    const nights = Math.max(1, Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / 86_400_000));
    return {
      id: b.id,
      name: b.guest.name,
      channel: asChannelId(b.channel?.type),
      nights,
      flag: COUNTRY_FLAGS[b.guest.country ?? ""] ?? "🏳️",
      total: b.total,
    };
  });
}

export interface MobileKpi {
  occupancy: number;
  todayRevenue: number;
  syncedChannels: number;
  totalChannels: number;
}

export interface MobileDashboardData {
  arrivals: ArrivalRow[];
  kpi: MobileKpi;
  issuesCount: number;
  roomTypeOptions: RoomTypeOption[];
}

export async function getMobileDashboard(): Promise<MobileDashboardData> {
  const hotelId = await currentHotelId();
  const today = startOfTodayUtc();
  const tomorrow = addDays(today, 1);

  const [arrivals, inhouseBookings, channels, totalRooms, recentSyncIssues, roomTypeOptions] = await Promise.all([
    getTodayArrivals(5),
    prisma.booking.findMany({
      where: {
        hotelId,
        status: { in: ["confirmed", "in_house"] },
        checkIn: { lt: tomorrow },
        checkOut: { gt: today },
      },
      select: { total: true, checkIn: true, checkOut: true },
    }),
    prisma.channel.findMany({ where: { hotelId }, select: { status: true } }),
    prisma.room.count({ where: { roomType: { hotelId } } }),
    prisma.syncLog.count({
      where: {
        channel: { hotelId },
        result: { in: ["warn", "error"] },
        occurredAt: { gte: addDays(today, -1) },
      },
    }),
    getRoomTypeOptions(),
  ]);

  const todayRevenue = inhouseBookings.reduce((s, b) => {
    const nights = Math.max(1, Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / 86_400_000));
    return s + Math.round(b.total / nights);
  }, 0);
  const occupancy = Math.min(100, Math.round((inhouseBookings.length / Math.max(1, totalRooms)) * 100));
  const syncedChannels = channels.filter((c) => c.status === "synced").length;
  const offlineChannels = channels.filter((c) => c.status === "delayed" || c.status === "error").length;

  return {
    arrivals,
    kpi: { occupancy, todayRevenue, syncedChannels, totalChannels: channels.length },
    issuesCount: recentSyncIssues + offlineChannels,
    roomTypeOptions,
  };
}

// ─── Bookings ─────────────────────────────────────────────────────────────

export interface BookingTimelineEvent {
  type: BookingEventType;
  occurredAt: string;
  body: string | null;
}

export interface BookingRequestRow {
  type: BookingRequestType;
  label: string;
}

export interface GuestLifetime {
  bookingsCount: number;
  lifetimeRevenue: number;
  firstStayIso: string | null;
}

export type BookingWarningKind = "payment_failed" | "refund_pending" | "no_room" | "stale_pending";
export type BookingWarningAction = "mark_paid" | "mark_refunded" | "send_reminder" | null;

export interface BookingWarning {
  kind: BookingWarningKind;
  severity: "bad" | "warn" | "info";
  label: string;
  action: BookingWarningAction;
  actionLabel: string | null;
}

export interface BookingRow {
  id: string;
  externalRef: string | null;
  status: BookingStatus;
  payment: PaymentStatus;
  channel: ChannelId;
  guest: { id: string; name: string; email: string | null; phone: string | null; flag: string; country: string | null; lifetime: GuestLifetime };
  roomType: { name: string };
  roomNumber: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  total: number;
  createdAt: string;
  notes: string | null;
  /** Thread id for the (guest, channel) pair, if a thread exists. */
  threadId: string | null;
  requests: BookingRequestRow[];
  events: BookingTimelineEvent[];
  warnings: BookingWarning[];
}

function computeBookingWarnings(b: {
  status: BookingStatus;
  payment: PaymentStatus;
  roomId: string | null;
  checkIn: Date;
  createdAt: Date;
}): BookingWarning[] {
  const out: BookingWarning[] = [];
  const now = new Date();
  if (b.payment === "failed") {
    out.push({
      kind: "payment_failed",
      severity: "bad",
      label: "결제 실패 — 게스트 카드 재시도 필요",
      action: "mark_paid",
      actionLabel: "수동 결제 완료",
    });
  }
  if (b.status === "cancelled" && b.payment === "paid") {
    out.push({
      kind: "refund_pending",
      severity: "warn",
      label: "취소되었으나 환불 미처리",
      action: "mark_refunded",
      actionLabel: "환불 처리",
    });
  }
  if ((b.status === "confirmed" || b.status === "in_house") && !b.roomId) {
    out.push({
      kind: "no_room",
      severity: "warn",
      label: "객실이 배정되지 않음",
      action: null,
      actionLabel: null,
    });
  }
  const daysUntilCheckin = (b.checkIn.getTime() - now.getTime()) / 86_400_000;
  if (b.payment === "pending" && daysUntilCheckin >= 0 && daysUntilCheckin < 1) {
    out.push({
      kind: "stale_pending",
      severity: "info",
      label: "체크인 24시간 이내 결제 미완료",
      action: "send_reminder",
      actionLabel: "결제 독촉 발송",
    });
  }
  return out;
}

export interface BookingFilter {
  /** Free-text query over guest name, email, externalRef. Case-insensitive. */
  q?: string;
  /** Channel ids to include (e.g. ["airbnb","direct"]). Empty/absent = all. */
  channels?: ChannelId[];
  /** Booking statuses to include. Empty/absent = all. */
  statuses?: BookingStatus[];
  /** ISO date inclusive: only bookings with checkIn ≥ this. Defaults to today. */
  startDate?: string;
  /** ISO date inclusive: only bookings with checkIn ≤ this. */
  endDate?: string;
}

export interface BookingsPage {
  rows: BookingRow[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export async function getBookings(limit = 50, filter: BookingFilter = {}): Promise<BookingRow[]> {
  const page = await getBookingsPage(0, limit, filter);
  return page.rows;
}

/**
 * Paginated variant. `page` is 0-indexed. Returns the slice + total + hasMore
 * so the UI can render `Showing X–Y of Z` and a Next/Prev pair.
 */
export async function getBookingsPage(
  page = 0,
  pageSize = 50,
  filter: BookingFilter = {},
): Promise<BookingsPage> {
  const hotelId = await currentHotelId();
  const today = startOfTodayUtc();

  const checkInFilter: { gte?: Date; lte?: Date } = {};
  if (filter.startDate) {
    checkInFilter.gte = new Date(`${filter.startDate}T00:00:00Z`);
  } else {
    checkInFilter.gte = today;
  }
  if (filter.endDate) {
    checkInFilter.lte = new Date(`${filter.endDate}T23:59:59Z`);
  }

  const channelTypes = filter.channels && filter.channels.length > 0
    ? (filter.channels as unknown as ChannelType[])
    : undefined;

  const q = filter.q?.trim();
  const where = {
    hotelId,
    checkIn: checkInFilter,
    ...(channelTypes ? { channel: { type: { in: channelTypes } } } : {}),
    ...(filter.statuses && filter.statuses.length > 0 ? { status: { in: filter.statuses } } : {}),
    ...(q
      ? {
          OR: [
            { guest: { name: { contains: q, mode: "insensitive" as const } } },
            { guest: { email: { contains: q, mode: "insensitive" as const } } },
            { externalRef: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  // total + page in parallel — count() is fast on the indexed (hotelId, checkIn) compound
  const [total, pagedRows] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      include: {
        guest: true,
        channel: true,
        roomType: true,
        room: true,
        requests: true,
        events: { orderBy: { occurredAt: "asc" } },
      },
      orderBy: [{ externalRef: { sort: "asc", nulls: "last" } }, { checkIn: "asc" }],
      skip: page * pageSize,
      take: pageSize,
    }),
  ]);

  // Reuse the original mapper by wrapping the inner findMany result.
  const rows = await mapBookings(pagedRows);
  return {
    rows,
    total,
    page,
    pageSize,
    hasMore: (page + 1) * pageSize < total,
  };
}

/**
 * Hydrates raw Prisma booking rows into the rich `BookingRow` shape used by
 * the UI. Batches guest-lifetime + thread lookups to avoid N+1.
 */
type BookingPrismaRow = Awaited<ReturnType<typeof prisma.booking.findMany<{
  include: {
    guest: true;
    channel: true;
    roomType: true;
    room: true;
    requests: true;
    events: { orderBy: { occurredAt: "asc" } };
  };
}>>>[number];

async function mapBookings(rows: BookingPrismaRow[]): Promise<BookingRow[]> {
  // Batch lookup guest lifetime stats — sum of all non-cancelled bookings per guest
  const guestIds = Array.from(new Set(rows.map((b) => b.guestId)));
  const lifetimeByGuest = new Map<string, GuestLifetime>();
  if (guestIds.length > 0) {
    const allBookings = await prisma.booking.findMany({
      where: { guestId: { in: guestIds }, status: { not: "cancelled" } },
      select: { guestId: true, total: true, checkIn: true },
    });
    const acc = new Map<string, { count: number; revenue: number; first: Date | null }>();
    for (const b of allBookings) {
      const cur = acc.get(b.guestId) ?? { count: 0, revenue: 0, first: null };
      cur.count += 1;
      cur.revenue += b.total;
      if (!cur.first || b.checkIn < cur.first) cur.first = b.checkIn;
      acc.set(b.guestId, cur);
    }
    for (const [gid, v] of acc.entries()) {
      lifetimeByGuest.set(gid, {
        bookingsCount: v.count,
        lifetimeRevenue: v.revenue,
        firstStayIso: v.first ? isoDate(v.first) : null,
      });
    }
  }

  // Batch lookup threads for the (guest, channel) pairs we just fetched
  const pairs = Array.from(
    new Set(
      rows
        .filter((b) => b.channelId)
        .map((b) => `${b.guestId}:${b.channelId}`),
    ),
  );
  const threadByPair = new Map<string, string>();
  if (pairs.length > 0) {
    const threads = await prisma.thread.findMany({
      where: {
        OR: pairs.map((p) => {
          const [guestId, channelId] = p.split(":");
          return { guestId, channelId };
        }),
      },
      select: { id: true, guestId: true, channelId: true },
    });
    for (const t of threads) {
      if (t.channelId) threadByPair.set(`${t.guestId}:${t.channelId}`, t.id);
    }
  }

  return rows.map((b) => {
    const nights = Math.max(1, Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / 86_400_000));
    return {
      id: b.id,
      externalRef: b.externalRef,
      status: b.status,
      payment: b.payment,
      channel: asChannelId(b.channel?.type),
      guest: {
        id: b.guestId,
        name: b.guest.name,
        email: b.guest.email,
        phone: b.guest.phone,
        country: b.guest.country,
        flag: COUNTRY_FLAGS[b.guest.country ?? ""] ?? "🏳️",
        lifetime: lifetimeByGuest.get(b.guestId) ?? { bookingsCount: 0, lifetimeRevenue: 0, firstStayIso: null },
      },
      roomType: { name: b.roomType.name },
      roomNumber: b.room?.number ?? null,
      checkIn: isoDate(b.checkIn),
      checkOut: isoDate(b.checkOut),
      nights,
      total: b.total,
      createdAt: b.createdAt.toISOString(),
      notes: b.notes,
      threadId: b.channelId ? (threadByPair.get(`${b.guestId}:${b.channelId}`) ?? null) : null,
      warnings: computeBookingWarnings(b),
      requests: b.requests.map((r) => ({ type: r.type, label: r.label })),
      events: b.events.map((e) => ({ type: e.type, occurredAt: e.occurredAt.toISOString(), body: e.body })),
    };
  });
}

// ─── Calendar ─────────────────────────────────────────────────────────────

export interface CalendarDay {
  iso: string;
  dom: number;
  dow: number;
  weekend: boolean;
  today: boolean;
}

export interface CalendarCell {
  available: number;
  capacity: number;
  over: boolean;
  closed: boolean;
  minStay: number;
  rates: Partial<Record<ChannelId, number>>;
}

export interface CalendarBookingSpan {
  bookingId: string;
  channel: ChannelId;
  start: number;
  end: number;
  name: string;
  guestFlag: string;
  externalRef: string | null;
  status: BookingStatus;
  payment: PaymentStatus;
  total: number;
  roomTypeName: string;
  /** YYYY-MM-DD */
  checkIn: string;
  checkOut: string;
  /** Thread for the booking's (guest, channel) pair, if any. */
  threadId: string | null;
  guestLifetime: GuestLifetime;
}

export interface CalendarRoomRow {
  roomTypeId: string;
  name: string;
  count: number;
  cells: CalendarCell[];
  bookings: CalendarBookingSpan[];
}

export interface CalendarGrid {
  days: CalendarDay[];
  rows: CalendarRoomRow[];
  channels: ChannelId[];
}

const CAL_CHANNELS: ChannelId[] = ["airbnb", "booking", "agoda", "trip", "direct"];

export async function getCalendarGrid(days = 14, startIso?: string): Promise<CalendarGrid> {
  const hotelId = await currentHotelId();
  const start = startIso ? new Date(`${startIso}T00:00:00.000Z`) : startOfTodayUtc();
  // If parsing yielded an invalid date (NaN), fall back to today
  const validStart = Number.isNaN(start.getTime()) ? startOfTodayUtc() : start;
  const end = addDays(validStart, days);

  const todayIso = isoDate(startOfTodayUtc());
  const dayDefs: CalendarDay[] = Array.from({ length: days }, (_, i) => {
    const d = addDays(validStart, i);
    const dow = d.getUTCDay();
    const iso = isoDate(d);
    return {
      iso,
      dom: d.getUTCDate(),
      dow,
      weekend: dow === 0 || dow === 6,
      today: iso === todayIso,
    };
  });

  const [roomTypes, inventory, rates, bookings] = await Promise.all([
    prisma.roomType.findMany({
      where: { hotelId },
      include: { rooms: { select: { id: true } } },
      orderBy: { baseRate: "asc" },
    }),
    prisma.inventory.findMany({ where: { roomType: { hotelId }, date: { gte: start, lt: end } } }),
    prisma.rate.findMany({
      where: {
        roomType: { hotelId },
        date: { gte: start, lt: end },
        channel: { type: { in: CAL_CHANNELS as unknown as ChannelType[] } },
        ratePlan: { name: "Standard" },
      },
      include: { channel: { select: { type: true } } },
    }),
    prisma.booking.findMany({
      where: {
        hotelId,
        status: { in: ["confirmed", "in_house"] },
        checkIn: { lt: end },
        checkOut: { gt: start },
      },
      include: {
        guest: { select: { name: true, country: true } },
        channel: { select: { type: true } },
        roomType: { select: { name: true } },
      },
    }),
  ]);

  // Batch thread lookup for the (guest, channel) pairs we just fetched
  const threadPairs = Array.from(
    new Set(bookings.filter((b) => b.channelId).map((b) => `${b.guestId}:${b.channelId}`)),
  );
  const threadByPair = new Map<string, string>();
  if (threadPairs.length > 0) {
    const threads = await prisma.thread.findMany({
      where: {
        OR: threadPairs.map((p) => {
          const [guestId, channelId] = p.split(":");
          return { guestId, channelId };
        }),
      },
      select: { id: true, guestId: true, channelId: true },
    });
    for (const t of threads) {
      if (t.channelId) threadByPair.set(`${t.guestId}:${t.channelId}`, t.id);
    }
  }

  // Batch lifetime stats lookup per guest seen in the calendar window
  const calGuestIds = Array.from(new Set(bookings.map((b) => b.guestId)));
  const lifetimeByGuestCal = new Map<string, GuestLifetime>();
  if (calGuestIds.length > 0) {
    const allBookings = await prisma.booking.findMany({
      where: { guestId: { in: calGuestIds }, status: { not: "cancelled" } },
      select: { guestId: true, total: true, checkIn: true },
    });
    const acc = new Map<string, { count: number; revenue: number; first: Date | null }>();
    for (const b of allBookings) {
      const cur = acc.get(b.guestId) ?? { count: 0, revenue: 0, first: null };
      cur.count += 1;
      cur.revenue += b.total;
      if (!cur.first || b.checkIn < cur.first) cur.first = b.checkIn;
      acc.set(b.guestId, cur);
    }
    for (const [gid, v] of acc.entries()) {
      lifetimeByGuestCal.set(gid, {
        bookingsCount: v.count,
        lifetimeRevenue: v.revenue,
        firstStayIso: v.first ? isoDate(v.first) : null,
      });
    }
  }

  const inventoryByRtDate = new Map<string, { available: number; closed: boolean; minStay: number }>();
  for (const r of inventory) inventoryByRtDate.set(`${r.roomTypeId}:${isoDate(r.date)}`, r);

  const ratesByRtDateChannel = new Map<string, number>();
  for (const r of rates) {
    if (!r.channelId || !r.channel) continue;
    ratesByRtDateChannel.set(`${r.roomTypeId}:${isoDate(r.date)}:${r.channel.type}`, r.amount);
  }

  // Count concurrent bookings per (roomTypeId, dayIndex) for over-flag
  const occupancyByRtDay = new Map<string, number>();
  for (const b of bookings) {
    const startOffset = Math.max(0, Math.floor((b.checkIn.getTime() - validStart.getTime()) / 86_400_000));
    const endOffset = Math.min(days - 1, Math.floor((b.checkOut.getTime() - 86_400_000 - validStart.getTime()) / 86_400_000));
    for (let i = startOffset; i <= endOffset; i++) {
      const key = `${b.roomTypeId}:${i}`;
      occupancyByRtDay.set(key, (occupancyByRtDay.get(key) ?? 0) + 1);
    }
  }

  const rows: CalendarRoomRow[] = roomTypes.map((rt) => {
    const capacity = rt.rooms.length;
    const cells: CalendarCell[] = dayDefs.map((d, i) => {
      const inv = inventoryByRtDate.get(`${rt.id}:${d.iso}`);
      const occ = occupancyByRtDay.get(`${rt.id}:${i}`) ?? 0;
      const available = inv?.available ?? Math.max(0, capacity - occ);
      const over = occ > capacity;
      const closed = inv?.closed ?? false;
      const minStay = inv?.minStay ?? 1;
      const rates: Partial<Record<ChannelId, number>> = {};
      for (const ch of CAL_CHANNELS) {
        const v = ratesByRtDateChannel.get(`${rt.id}:${d.iso}:${ch}`);
        if (v !== undefined) rates[ch] = v;
      }
      return { available, capacity, over, closed, minStay, rates };
    });

    const rtBookings: CalendarBookingSpan[] = bookings
      .filter((b) => b.roomTypeId === rt.id)
      .map((b) => {
        const startOffset = Math.max(0, Math.floor((b.checkIn.getTime() - validStart.getTime()) / 86_400_000));
        const endOffset = Math.min(days - 1, Math.floor((b.checkOut.getTime() - 86_400_000 - validStart.getTime()) / 86_400_000));
        return {
          bookingId: b.id,
          channel: asChannelId(b.channel?.type),
          start: startOffset,
          end: endOffset,
          name: b.guest.name.length > 8 ? b.guest.name.slice(0, 7) + "…" : b.guest.name,
          guestFlag: COUNTRY_FLAGS[b.guest.country ?? ""] ?? "🏳️",
          externalRef: b.externalRef,
          status: b.status,
          payment: b.payment,
          total: b.total,
          roomTypeName: b.roomType.name,
          checkIn: isoDate(b.checkIn),
          checkOut: isoDate(b.checkOut),
          threadId: b.channelId ? (threadByPair.get(`${b.guestId}:${b.channelId}`) ?? null) : null,
          guestLifetime: lifetimeByGuestCal.get(b.guestId) ?? { bookingsCount: 0, lifetimeRevenue: 0, firstStayIso: null },
        };
      })
      .filter((s) => s.end >= s.start);

    return { roomTypeId: rt.id, name: rt.name, count: capacity, cells, bookings: rtBookings };
  });

  return { days: dayDefs, rows, channels: CAL_CHANNELS };
}

// ─── Channels ─────────────────────────────────────────────────────────────

export interface ChannelMappingRow {
  channelDbId: string;
  channelType: ChannelId;
  roomTypeId: string;
  roomTypeName: string;
  externalId: string | null;
}

/** Returns one row per (channel × roomType) — null externalId means unmapped */
export async function getChannelMappings(): Promise<ChannelMappingRow[]> {
  const hotelId = await currentHotelId();
  const [channels, roomTypes, existing] = await Promise.all([
    prisma.channel.findMany({ where: { hotelId }, select: { id: true, type: true } }),
    prisma.roomType.findMany({ where: { hotelId }, select: { id: true, name: true }, orderBy: { baseRate: "asc" } }),
    prisma.channelMap.findMany({
      where: { channel: { hotelId } },
      select: { channelId: true, roomTypeId: true, externalId: true },
    }),
  ]);
  const byKey = new Map<string, string>();
  for (const m of existing) byKey.set(`${m.channelId}:${m.roomTypeId}`, m.externalId);

  const rows: ChannelMappingRow[] = [];
  for (const ch of channels) {
    for (const rt of roomTypes) {
      rows.push({
        channelDbId: ch.id,
        channelType: asChannelId(ch.type),
        roomTypeId: rt.id,
        roomTypeName: rt.name,
        externalId: byKey.get(`${ch.id}:${rt.id}`) ?? null,
      });
    }
  }
  return rows;
}

export interface ChannelOverviewRow {
  id: ChannelId;
  /** Underlying DB cuid — required by mutation actions like syncNowChannel */
  dbId: string;
  status: PrismaChannelStatus;
  bookings: number;
  revenue: number;
  fee: number;
  lastSync: string | null;
  issues: number;
  listings: number;
  icalUrl: string | null;
  icalExportToken: string | null;
}

export interface SyncLogRow {
  id: string;
  occurredAt: string;
  channel: ChannelId;
  op: SyncOp;
  target: string;
  result: SyncResult;
  durationMs: number | null;
  note: string | null;
}

export async function getChannelOverview(): Promise<ChannelOverviewRow[]> {
  const hotelId = await currentHotelId();
  const monthStart = startOfTodayUtc();
  monthStart.setUTCDate(1);

  const channels = await prisma.channel.findMany({
    where: { hotelId },
    include: {
      _count: { select: { mappings: true, syncLogs: { where: { result: { in: ["warn", "error"] } } } } },
      bookings: {
        where: { createdAt: { gte: monthStart }, status: { not: "cancelled" } },
        select: { total: true },
      },
    },
  });

  const COMMISSION: Record<ChannelType, number> = {
    airbnb: 15,
    booking: 17,
    agoda: 18,
    trip: 15,
    direct: 0,
    fb: 0,
    yanolja: 16,
    naver: 0,
  };

  return channels.map((c) => ({
    id: asChannelId(c.type),
    dbId: c.id,
    status: c.status,
    bookings: c.bookings.length,
    revenue: c.bookings.reduce((s, b) => s + b.total, 0),
    fee: COMMISSION[c.type],
    lastSync: c.lastSyncAt ? c.lastSyncAt.toISOString() : null,
    issues: c._count.syncLogs,
    listings: c._count.mappings,
    icalUrl: c.icalUrl,
    icalExportToken: c.icalExportToken,
  }));
}

export interface MiddlewareRow {
  id: string;
  type: MiddlewareType;
  status: MiddlewareStatus;
  propertyId: string | null;
  lastSync: string | null;
}

export async function getMiddlewares(): Promise<MiddlewareRow[]> {
  const hotelId = await currentHotelId();
  const rows = await prisma.middleware.findMany({ where: { hotelId }, orderBy: { createdAt: "asc" } });
  return rows.map((m) => ({
    id: m.id,
    type: m.type,
    status: m.status,
    propertyId: m.propertyId,
    lastSync: m.lastSyncAt ? m.lastSyncAt.toISOString() : null,
  }));
}

export async function getSyncLog(limit = 20): Promise<SyncLogRow[]> {
  const hotelId = await currentHotelId();
  const rows = await prisma.syncLog.findMany({
    where: { channel: { hotelId } },
    include: { channel: { select: { type: true } } },
    orderBy: { occurredAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    occurredAt: r.occurredAt.toISOString(),
    channel: asChannelId(r.channel.type),
    op: r.op,
    target: r.target,
    result: r.result,
    durationMs: r.durationMs,
    note: r.note,
  }));
}

// ─── Revenue ──────────────────────────────────────────────────────────────

export interface MonthlyRevenue {
  /** UTC year-month tag yyyy-mm */
  ym: string;
  byChannel: Partial<Record<ChannelId, number>>;
  total: number;
}

export interface ProfitabilityRow {
  channel: ChannelId;
  revenue: number;
  fee: number;
  net: number;
  margin: number;
}

export interface CountryRow {
  code: string;
  name: { ko: string; en: string };
  flag: string;
  bookings: number;
  pct: number;
  revenue: number;
}

export type RevenueRange = "7d" | "30d" | "6M" | "YTD";

export interface RevenueData {
  /** Effective time-window the data covers. */
  range: RevenueRange;
  /** Display label for the window (e.g. "지난 7일", "Past 30 days"). Set on UI. */
  monthly: MonthlyRevenue[];
  totalAll: number;
  profitability: ProfitabilityRow[];
  countries: CountryRow[];
  kpi: { totalRev: number; revpar: number; adr: number; occupancy: number };
  /** 14-day forward-looking daily ADR/RevPAR/Occupancy. */
  dailyTrend: OccupancyTrendPoint[];
}

const COMMISSION_RATE: Record<ChannelType, number> = {
  airbnb: 0.15,
  booking: 0.17,
  agoda: 0.18,
  trip: 0.15,
  direct: 0,
  fb: 0,
  yanolja: 0.16,
  naver: 0,
};

function ymKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ─── Occupancy trend (chart-friendly) ────────────────────────────────────

export interface OccupancyTrendPoint {
  date: string;
  pct: number;
  /** KRW prorated to this day (booking.total / nights for each overlapping booking) */
  revenue: number;
  /** Average Daily Rate — revenue / occupied rooms (KRW). 0 when nothing occupied. */
  adr: number;
  /** Revenue Per Available Room — revenue / total rooms (KRW). */
  revpar: number;
}

export async function getOccupancyTrend(days = 14): Promise<OccupancyTrendPoint[]> {
  const hotelId = await currentHotelId();
  const start = startOfTodayUtc();
  const end = addDays(start, days);

  const [totalRooms, bookings] = await Promise.all([
    prisma.room.count({ where: { roomType: { hotelId } } }),
    prisma.booking.findMany({
      where: {
        hotelId,
        status: { in: ["confirmed", "in_house"] },
        checkIn: { lt: end },
        checkOut: { gt: start },
      },
      select: { checkIn: true, checkOut: true, total: true },
    }),
  ]);

  const cap = Math.max(1, totalRooms);
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(start, i);
    const dEnd = addDays(d, 1);
    let occupied = 0;
    let revenue = 0;
    for (const b of bookings) {
      if (b.checkIn < dEnd && b.checkOut > d) {
        occupied++;
        const nights = Math.max(1, Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / 86_400_000));
        revenue += Math.round(b.total / nights);
      }
    }
    const adr = occupied > 0 ? Math.round(revenue / occupied) : 0;
    const revpar = Math.round(revenue / cap);
    return {
      date: isoDate(d),
      pct: Math.min(100, Math.round((occupied / cap) * 100)),
      revenue,
      adr,
      revpar,
    };
  });
}

// ─── Room conflict detection ────────────────────────────────────────────

export interface RoomConflictAlternative {
  /** Available room id you could swap to. */
  roomId: string;
  number: string;
  /** Room type id (always matches the booking's roomTypeId). */
  roomTypeId: string;
}

export interface RoomConflictRow {
  /** The booking pair that overlap on the same room. We surface ONE side
   *  (the newer one) as "conflicting" — the older one is shown via `withBookingId`. */
  bookingId: string;
  bookingRef: string | null;
  guestName: string;
  roomNumber: string | null;
  roomTypeName: string;
  checkIn: string;
  checkOut: string;
  withBookingId: string;
  withBookingRef: string | null;
  withGuestName: string;
  /** Alternative rooms of the same type that are free for the same window. */
  alternatives: RoomConflictAlternative[];
}

export async function getRoomConflicts(): Promise<RoomConflictRow[]> {
  const hotelId = await currentHotelId();
  // Pull all confirmed/in-house bookings for this hotel where roomId is set.
  // Cancelled / checked-out are excluded — they don't represent live conflicts.
  const bookings = await prisma.booking.findMany({
    where: {
      hotelId,
      status: { in: ["confirmed", "in_house"] },
      NOT: { roomId: null },
    },
    select: {
      id: true,
      externalRef: true,
      roomId: true,
      roomTypeId: true,
      checkIn: true,
      checkOut: true,
      createdAt: true,
      guest: { select: { name: true } },
      room: { select: { number: true } },
      roomType: { select: { name: true, id: true } },
    },
    orderBy: { checkIn: "asc" },
  });

  // Bucket by room and detect overlaps. Two bookings conflict when
  // a.checkIn < b.checkOut AND a.checkOut > b.checkIn.
  const byRoom = new Map<string, typeof bookings>();
  for (const b of bookings) {
    const arr = byRoom.get(b.roomId!) ?? [];
    arr.push(b);
    byRoom.set(b.roomId!, arr);
  }
  const conflicts: { newer: typeof bookings[number]; older: typeof bookings[number] }[] = [];
  for (const arr of byRoom.values()) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];
        if (a.checkIn < b.checkOut && a.checkOut > b.checkIn) {
          // Newer one is the "conflicting" side — easier mental model for the operator.
          const newer = a.createdAt > b.createdAt ? a : b;
          const older = newer === a ? b : a;
          conflicts.push({ newer, older });
        }
      }
    }
  }
  if (conflicts.length === 0) return [];

  // Resolve alternative rooms (same room type, no overlap with this booking's window).
  const allRoomTypeIds = Array.from(new Set(conflicts.map((c) => c.newer.roomTypeId)));
  const candidateRooms = await prisma.room.findMany({
    where: { roomTypeId: { in: allRoomTypeIds } },
    select: { id: true, number: true, roomTypeId: true },
  });
  const roomsByType = new Map<string, typeof candidateRooms>();
  for (const r of candidateRooms) {
    const list = roomsByType.get(r.roomTypeId) ?? [];
    list.push(r);
    roomsByType.set(r.roomTypeId, list);
  }
  // For "is room free in this window?" we need ALL bookings on that room
  // (active statuses only) — same lookup we already have in `bookings`,
  // re-bucketed by roomId.

  return conflicts.map((c) => {
    const newer = c.newer;
    const sameTypeRooms = roomsByType.get(newer.roomTypeId) ?? [];
    const alternatives: RoomConflictAlternative[] = [];
    for (const candidate of sameTypeRooms) {
      if (candidate.id === newer.roomId) continue;
      const occupants = byRoom.get(candidate.id) ?? [];
      const conflictsHere = occupants.some(
        (o) => o.id !== newer.id && o.checkIn < newer.checkOut && o.checkOut > newer.checkIn,
      );
      if (!conflictsHere) {
        alternatives.push({ roomId: candidate.id, number: candidate.number, roomTypeId: candidate.roomTypeId });
      }
    }
    return {
      bookingId: newer.id,
      bookingRef: newer.externalRef,
      guestName: newer.guest.name,
      roomNumber: newer.room?.number ?? null,
      roomTypeName: newer.roomType.name,
      checkIn: isoDate(newer.checkIn),
      checkOut: isoDate(newer.checkOut),
      withBookingId: c.older.id,
      withBookingRef: c.older.externalRef,
      withGuestName: c.older.guest.name,
      alternatives,
    };
  });
}

// ─── Privacy / GDPR ────────────────────────────────────────────────────

const GDPR_GRACE_DAYS = 30;

export interface GuestDeletionQueueRow {
  id: string;
  name: string;
  email: string | null;
  requestedAt: string;
  /** ISO date when the cron will hard-delete (requestedAt + 30 days). */
  hardDeleteAt: string;
  /** Negative if past the cutoff. */
  daysRemaining: number;
}

export async function getDeletionQueue(): Promise<GuestDeletionQueueRow[]> {
  const hotelId = await currentHotelId();
  const rows = await prisma.guest.findMany({
    where: { hotelId, NOT: { deletionRequestedAt: null } },
    select: { id: true, name: true, email: true, deletionRequestedAt: true },
    orderBy: { deletionRequestedAt: "asc" },
  });
  const now = Date.now();
  return rows.map((r) => {
    const reqMs = r.deletionRequestedAt!.getTime();
    const hardMs = reqMs + GDPR_GRACE_DAYS * 86_400_000;
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      requestedAt: r.deletionRequestedAt!.toISOString(),
      hardDeleteAt: new Date(hardMs).toISOString(),
      daysRemaining: Math.ceil((hardMs - now) / 86_400_000),
    };
  });
}

export interface GuestDataExport {
  meta: {
    exportedAt: string;
    hotelId: string;
    schemaVersion: 1;
  };
  guest: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    country: string | null;
    language: string | null;
    notes: string | null;
    tags: string[];
    createdAt: string;
    deletionRequestedAt: string | null;
  };
  bookings: Array<{
    id: string;
    externalRef: string | null;
    status: string;
    payment: string;
    checkIn: string;
    checkOut: string;
    total: number;
    notes: string | null;
    createdAt: string;
    channel: string | null;
    roomType: string;
    events: Array<{ type: string; occurredAt: string; body: string | null }>;
    requests: Array<{ type: string; label: string }>;
  }>;
  threads: Array<{
    id: string;
    channel: string | null;
    lastMessageAt: string;
    messages: Array<{ sender: string; body: string; createdAt: string }>;
  }>;
}

export async function exportGuestData(guestId: string): Promise<GuestDataExport | null> {
  const hotelId = await currentHotelId();
  const guest = await prisma.guest.findFirst({
    where: { id: guestId, hotelId },
    include: {
      bookings: {
        include: {
          channel: { select: { type: true } },
          roomType: { select: { name: true } },
          events: { orderBy: { occurredAt: "asc" } },
          requests: true,
        },
      },
      threads: {
        include: {
          channel: { select: { type: true } },
          messages: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!guest) return null;
  return {
    meta: { exportedAt: new Date().toISOString(), hotelId, schemaVersion: 1 },
    guest: {
      id: guest.id,
      name: guest.name,
      email: guest.email,
      phone: guest.phone,
      country: guest.country,
      language: guest.language,
      notes: guest.notes,
      tags: guest.tags,
      createdAt: guest.createdAt.toISOString(),
      deletionRequestedAt: guest.deletionRequestedAt?.toISOString() ?? null,
    },
    bookings: guest.bookings.map((b) => ({
      id: b.id,
      externalRef: b.externalRef,
      status: b.status,
      payment: b.payment,
      checkIn: b.checkIn.toISOString().slice(0, 10),
      checkOut: b.checkOut.toISOString().slice(0, 10),
      total: b.total,
      notes: b.notes,
      createdAt: b.createdAt.toISOString(),
      channel: b.channel?.type ?? null,
      roomType: b.roomType.name,
      events: b.events.map((e) => ({ type: e.type, occurredAt: e.occurredAt.toISOString(), body: e.body })),
      requests: b.requests.map((r) => ({ type: r.type, label: r.label })),
    })),
    threads: guest.threads.map((t) => ({
      id: t.id,
      channel: t.channel?.type ?? null,
      lastMessageAt: t.lastMessageAt.toISOString(),
      messages: t.messages.map((m) => ({ sender: m.sender, body: m.body, createdAt: m.createdAt.toISOString() })),
    })),
  };
}

// ─── Room status board (for /housekeeping) ─────────────────────────────

export type RoomStateStr = "vacant_clean" | "vacant_dirty" | "occupied" | "out_of_order";

export interface RoomStateRow {
  id: string;
  number: string;
  roomTypeName: string;
  /** Effective state — `occupied` overrides persisted state when an in_house booking covers today. */
  effectiveState: RoomStateStr;
  /** Persisted state (for the toggle UI to show what's stored vs computed). */
  storedState: RoomStateStr;
  stateNote: string | null;
  stateBy: string | null;
  stateAt: string;
  /** Current/next guest's name when occupied or arriving today. */
  currentGuestName: string | null;
  /** Today/tomorrow check-out date if occupied. */
  checkoutOn: string | null;
}

export interface RoomBoard {
  rooms: RoomStateRow[];
  /** Per-state counts for the header. */
  counts: Record<RoomStateStr, number>;
  /** Total rooms. */
  total: number;
}

export async function getRoomBoard(): Promise<RoomBoard> {
  const hotelId = await currentHotelId();
  const today = startOfTodayUtc();
  const tomorrow = addDays(today, 1);

  const [rooms, activeStays] = await Promise.all([
    prisma.room.findMany({
      where: { roomType: { hotelId } },
      include: { roomType: { select: { name: true } } },
      orderBy: [{ roomType: { name: "asc" } }, { number: "asc" }],
    }),
    // Bookings in_house with today between checkIn and checkOut.
    prisma.booking.findMany({
      where: {
        hotelId,
        status: "in_house",
        checkIn: { lt: tomorrow },
        checkOut: { gt: today },
        NOT: { roomId: null },
      },
      select: { roomId: true, checkOut: true, guest: { select: { name: true } } },
    }),
  ]);

  const occByRoom = new Map(activeStays.map((b) => [b.roomId!, b]));

  const counts: Record<RoomStateStr, number> = {
    vacant_clean: 0,
    vacant_dirty: 0,
    occupied: 0,
    out_of_order: 0,
  };

  const rows: RoomStateRow[] = rooms.map((r) => {
    const occ = occByRoom.get(r.id);
    // out_of_order trumps occupancy (room blocked even if a stale booking exists).
    let effective: RoomStateStr;
    if (r.state === "out_of_order") effective = "out_of_order";
    else if (occ) effective = "occupied";
    else effective = r.state as RoomStateStr;
    counts[effective]++;
    return {
      id: r.id,
      number: r.number,
      roomTypeName: r.roomType.name,
      effectiveState: effective,
      storedState: r.state as RoomStateStr,
      stateNote: r.stateNote,
      stateBy: r.stateBy,
      stateAt: r.stateAt.toISOString(),
      currentGuestName: occ?.guest.name ?? null,
      checkoutOn: occ ? occ.checkOut.toISOString().slice(0, 10) : null,
    };
  });

  return { rooms: rows, counts, total: rooms.length };
}

// ─── Inventory lock summary (for /channels) ────────────────────────────

export interface InventoryLockSummary {
  /** Active locks by target ChannelType for the next 30 days. */
  byChannel: Record<string, number>;
  /** Total active locks. */
  active: number;
  /** Released locks in the past 7 days — informational. */
  released7d: number;
}

export async function getInventoryLockSummary(): Promise<InventoryLockSummary> {
  const hotelId = await currentHotelId();
  const today = startOfTodayUtc();
  const horizon = addDays(today, 30);
  const since7d = addDays(today, -7);

  const [active, released] = await Promise.all([
    prisma.inventoryLock.findMany({
      where: { hotelId, releasedAt: null, startDate: { lt: horizon }, endDate: { gte: today } },
      select: { targetChannel: true, units: true },
    }),
    prisma.inventoryLock.count({
      where: { hotelId, releasedAt: { gte: since7d } },
    }),
  ]);

  const byChannel: Record<string, number> = {};
  let total = 0;
  for (const r of active) {
    byChannel[r.targetChannel] = (byChannel[r.targetChannel] ?? 0) + r.units;
    total += r.units;
  }
  return { byChannel, active: total, released7d: released };
}

// ─── Channel rate parity monitor ───────────────────────────────────────

export interface RateParityViolation {
  date: string;
  roomTypeId: string;
  roomTypeName: string;
  /** Highest channel rate found for this (rt, day). */
  maxRate: number;
  maxChannel: ChannelId;
  /** Lowest channel rate. */
  minRate: number;
  minChannel: ChannelId;
  /** Spread as % of min (e.g. max=110, min=100 → 10). */
  spreadPct: number;
  /** Per-channel rates for this row, sparse (only configured channels). */
  byChannel: Partial<Record<ChannelId, number>>;
}

export interface RateParityReport {
  /** Threshold above which a (rt, day) is flagged. Default 10%. */
  thresholdPct: number;
  /** Window the report covers. */
  rangeStart: string;
  rangeEnd: string;
  /** Violations, sorted by spreadPct DESC. */
  violations: RateParityViolation[];
  /** Total (rt, day) cells inspected. */
  totalCells: number;
  /** % of cells with parity issues. */
  violationRate: number;
}

export async function getRateParityReport(days = 7, thresholdPct = 10): Promise<RateParityReport> {
  const hotelId = await currentHotelId();
  const start = startOfTodayUtc();
  const end = addDays(start, days);
  const startIso = isoDate(start);
  const endIso = isoDate(addDays(end, -1));

  const [roomTypes, rates] = await Promise.all([
    prisma.roomType.findMany({ where: { hotelId }, select: { id: true, name: true } }),
    prisma.rate.findMany({
      where: {
        roomType: { hotelId },
        date: { gte: start, lt: end },
        ratePlan: { name: "Standard" },
      },
      include: { channel: { select: { type: true } } },
    }),
  ]);

  // Index: ${rtId}:${iso} → { channelId: amount }
  const byCell = new Map<string, Partial<Record<ChannelId, number>>>();
  for (const r of rates) {
    if (!r.channel) continue;
    const ch = asChannelId(r.channel.type);
    const key = `${r.roomTypeId}:${isoDate(r.date)}`;
    const cell = byCell.get(key) ?? {};
    cell[ch] = r.amount;
    byCell.set(key, cell);
  }

  const violations: RateParityViolation[] = [];
  let totalCells = 0;
  for (const rt of roomTypes) {
    for (let i = 0; i < days; i++) {
      const iso = isoDate(addDays(start, i));
      const key = `${rt.id}:${iso}`;
      const cell = byCell.get(key);
      // Skip cells with <2 channels — parity is undefined for one channel.
      if (!cell) continue;
      const entries = Object.entries(cell) as [ChannelId, number][];
      if (entries.length < 2) continue;
      totalCells++;

      let maxRate = -Infinity;
      let minRate = Infinity;
      let maxChannel: ChannelId = entries[0][0];
      let minChannel: ChannelId = entries[0][0];
      for (const [ch, amt] of entries) {
        if (amt > maxRate) { maxRate = amt; maxChannel = ch; }
        if (amt < minRate) { minRate = amt; minChannel = ch; }
      }
      const spreadPct = minRate > 0 ? Math.round(((maxRate - minRate) / minRate) * 1000) / 10 : 0;
      if (spreadPct >= thresholdPct) {
        violations.push({
          date: iso,
          roomTypeId: rt.id,
          roomTypeName: rt.name,
          maxRate,
          maxChannel,
          minRate,
          minChannel,
          spreadPct,
          byChannel: cell,
        });
      }
    }
  }
  violations.sort((a, b) => b.spreadPct - a.spreadPct);
  const violationRate = totalCells > 0 ? Math.round((violations.length / totalCells) * 1000) / 10 : 0;

  return {
    thresholdPct,
    rangeStart: startIso,
    rangeEnd: endIso,
    violations,
    totalCells,
    violationRate,
  };
}

// ─── Multi-hotel admin (for /admin/hotels) ─────────────────────────────

export interface HotelSummaryRow {
  id: string;
  name: string;
  isCurrent: boolean;
  /** Per-hotel KPIs for the past 30 days. */
  kpis: {
    bookingsCount: number;
    revenue: number;
    occupancyPct: number;
    /** Open booking warnings (`computeBookingWarnings.length > 0`). */
    needsAttention: number;
    rooms: number;
    channels: number;
  };
  createdAtIso: string;
}

/**
 * Lists every hotel reachable to the caller, with per-hotel quick KPIs.
 * Cross-tenant by design — used by org-level admins picking a workspace.
 *
 * Note: this query has NO `currentHotelId()` filter. Caller must enforce
 * authorization (Clerk org admin role) before exposing it.
 */
export async function getHotelsSummary(): Promise<HotelSummaryRow[]> {
  const currentId = await currentHotelId();
  const since = new Date(Date.now() - 30 * 86_400_000);

  const [hotels, bookingAggregates, roomCounts, channelCounts] = await Promise.all([
    prisma.hotel.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.booking.groupBy({
      by: ["hotelId"],
      where: { status: { not: "cancelled" }, checkIn: { gte: since } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.room.groupBy({
      by: ["roomTypeId"],
      _count: { _all: true },
    }),
    prisma.channel.groupBy({
      by: ["hotelId"],
      _count: { _all: true },
    }),
  ]);

  const aggByHotel = new Map(bookingAggregates.map((a) => [a.hotelId, a]));
  const channelByHotel = new Map(channelCounts.map((c) => [c.hotelId, c._count._all]));

  // Room counts → roomType.hotelId requires a join. Do it explicitly.
  const roomTypes = await prisma.roomType.findMany({ select: { id: true, hotelId: true } });
  const roomsByHotel = new Map<string, number>();
  for (const rt of roomTypes) {
    const cnt = roomCounts.find((c) => c.roomTypeId === rt.id)?._count._all ?? 0;
    roomsByHotel.set(rt.hotelId, (roomsByHotel.get(rt.hotelId) ?? 0) + cnt);
  }

  // "Needs attention" — count per-hotel bookings with a non-trivial warning.
  // This is a row-by-row scan; for many hotels at scale we'd swap to a
  // periodic materialized view, but at <50 hotels this is fine.
  const flaggedRows = await prisma.booking.findMany({
    where: {
      OR: [
        { payment: "failed" },
        { AND: [{ status: "cancelled" }, { payment: "paid" }] },
        { AND: [{ status: { in: ["confirmed", "in_house"] } }, { roomId: null }] },
      ],
    },
    select: { hotelId: true },
  });
  const needsByHotel = new Map<string, number>();
  for (const b of flaggedRows) {
    needsByHotel.set(b.hotelId, (needsByHotel.get(b.hotelId) ?? 0) + 1);
  }

  return hotels.map((h) => {
    const agg = aggByHotel.get(h.id);
    const rooms = roomsByHotel.get(h.id) ?? 0;
    // 30-day occupancy proxy: bookings × avg-3-night / (rooms × 30). Coarse but cheap.
    const bookingsCount = agg?._count._all ?? 0;
    const approxNights = bookingsCount * 2.5;
    const occupancyPct = rooms > 0 ? Math.min(100, Math.round((approxNights / (rooms * 30)) * 100)) : 0;
    return {
      id: h.id,
      name: h.name,
      isCurrent: h.id === currentId,
      kpis: {
        bookingsCount,
        revenue: agg?._sum.total ?? 0,
        occupancyPct,
        needsAttention: needsByHotel.get(h.id) ?? 0,
        rooms,
        channels: channelByHotel.get(h.id) ?? 0,
      },
      createdAtIso: h.createdAt.toISOString(),
    };
  });
}

// ─── Upcoming events (holidays + concerts, for Dashboard) ─────────────

export interface UpcomingEventItem {
  date: string;
  label: string;
  category: EventCategory;
  multiplier: number;
  /** Days from today (0 = today, 1 = tomorrow, …). */
  daysAway: number;
}

export function getUpcomingEvents(days = 30): UpcomingEventItem[] {
  // Read-only + deterministic from the in-memory event table → no async/IO.
  // Kept on the queries.ts surface so it co-locates with the dashboard fetcher.
  const today = startOfTodayUtc();
  const end = addDays(today, days);
  const startIso = isoDate(today);
  const endIso = isoDate(addDays(end, -1));
  const events = eventsInRange(startIso, endIso);
  return events.map(({ date, event }) => {
    const d = new Date(`${date}T00:00:00Z`);
    const daysAway = Math.round((d.getTime() - today.getTime()) / 86_400_000);
    return {
      date,
      label: event.label,
      category: event.category,
      multiplier: event.multiplier,
      daysAway,
    };
  });
}

// ─── Booking warning summary (for Dashboard) ──────────────────────────────

export interface BookingWarningSummaryItem {
  kind: BookingWarningKind;
  severity: "bad" | "warn" | "info";
  bookingId: string;
  guestName: string;
  bookingRef: string | null;
  channel: ChannelId;
  label: string;
  action: BookingWarningAction;
  actionLabel: string | null;
  /** Pre-resolved thread id for the (guest, channel) pair, used by send_reminder. */
  threadId: string | null;
  /** ISO date for the booking's check-in — used to compose reminder copy. */
  checkInIso: string;
}

export async function getBookingWarningSummary(limit = 4): Promise<BookingWarningSummaryItem[]> {
  const hotelId = await currentHotelId();
  // Scan upcoming + recent bookings (anything that could still need attention)
  const cutoff = new Date(Date.now() - 7 * 86_400_000);
  const rows = await prisma.booking.findMany({
    where: { hotelId, OR: [{ checkIn: { gte: cutoff } }, { status: "in_house" }] },
    select: {
      id: true,
      externalRef: true,
      status: true,
      payment: true,
      roomId: true,
      checkIn: true,
      createdAt: true,
      guestId: true,
      channelId: true,
      guest: { select: { name: true } },
      channel: { select: { type: true } },
    },
    take: 200,
  });

  // Batch-resolve threads for any (guest, channel) pair in the scanned set
  const threadKeys = new Set<string>();
  for (const b of rows) {
    if (b.channelId) threadKeys.add(`${b.guestId}::${b.channelId}`);
  }
  const threads = threadKeys.size
    ? await prisma.thread.findMany({
        where: {
          hotelId,
          OR: Array.from(threadKeys).map((k) => {
            const [guestId, channelId] = k.split("::");
            return { guestId, channelId };
          }),
        },
        select: { id: true, guestId: true, channelId: true },
      })
    : [];
  const threadByKey = new Map<string, string>();
  for (const t of threads) {
    if (t.channelId) threadByKey.set(`${t.guestId}::${t.channelId}`, t.id);
  }

  const items: BookingWarningSummaryItem[] = [];
  for (const b of rows) {
    const warnings = computeBookingWarnings(b);
    for (const w of warnings) {
      const threadId = b.channelId ? threadByKey.get(`${b.guestId}::${b.channelId}`) ?? null : null;
      items.push({
        kind: w.kind,
        severity: w.severity,
        bookingId: b.id,
        guestName: b.guest.name,
        bookingRef: b.externalRef,
        channel: asChannelId(b.channel?.type),
        label: w.label,
        action: w.action,
        actionLabel: w.actionLabel,
        threadId,
        checkInIso: b.checkIn.toISOString().slice(0, 10),
      });
    }
  }
  // bad > warn > info
  const sevRank: Record<"bad" | "warn" | "info", number> = { bad: 0, warn: 1, info: 2 };
  items.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
  return items.slice(0, limit);
}

// ─── Dashboard KPIs ───────────────────────────────────────────────────────

export interface KpiSeries {
  /** Most recent value (today or last data point). */
  current: number;
  /** Percent diff vs prior period (positive = up). */
  delta: number;
  /** 14-day sparkline values, oldest first. */
  spark: number[];
}

export interface DashboardKpis {
  occupancy: KpiSeries;
  adr: KpiSeries;
  revpar: KpiSeries;
  bookings: KpiSeries;
}

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const hotelId = await currentHotelId();
  const today = startOfTodayUtc();
  // 14-day window ending today (inclusive of today, but mostly historical)
  const start = addDays(today, -13);
  const end = addDays(today, 1);

  const [totalRooms, bookings, todayCreatedCount, prevWeekCreatedCount] = await Promise.all([
    prisma.room.count({ where: { roomType: { hotelId } } }),
    prisma.booking.findMany({
      where: {
        hotelId,
        status: { not: "cancelled" },
        checkIn: { lt: end },
        checkOut: { gt: start },
      },
      select: { checkIn: true, checkOut: true, total: true },
    }),
    prisma.booking.count({
      where: {
        hotelId,
        createdAt: { gte: today, lt: addDays(today, 1) },
      },
    }),
    prisma.booking.count({
      where: {
        hotelId,
        createdAt: { gte: addDays(today, -7), lt: today },
      },
    }),
  ]);

  const cap = Math.max(1, totalRooms);
  const occSpark: number[] = [];
  const adrSpark: number[] = [];
  const revparSpark: number[] = [];
  const bookSpark: number[] = [];

  for (let i = 0; i < 14; i++) {
    const d = addDays(start, i);
    const dEnd = addDays(d, 1);
    let occupied = 0;
    let nightsRevenue = 0;
    for (const b of bookings) {
      if (b.checkIn < dEnd && b.checkOut > d) {
        occupied++;
        const totalNights = Math.max(1, Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / 86_400_000));
        nightsRevenue += b.total / totalNights;
      }
    }
    const occPct = Math.min(100, Math.round((occupied / cap) * 100));
    const adr = occupied > 0 ? Math.round(nightsRevenue / occupied) : 0;
    const revpar = Math.round(nightsRevenue / cap);
    occSpark.push(occPct);
    adrSpark.push(adr);
    revparSpark.push(revpar);
    bookSpark.push(occupied);
  }

  // Deltas: avg of last 7 vs avg of prev 7
  const avg = (arr: number[]) => (arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length);
  const pctDelta = (cur: number, prev: number) =>
    prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 1000) / 10;
  const lastWeek = (arr: number[]) => arr.slice(7);
  const prevWeek = (arr: number[]) => arr.slice(0, 7);

  return {
    occupancy: {
      current: occSpark[occSpark.length - 1] ?? 0,
      delta: pctDelta(avg(lastWeek(occSpark)), avg(prevWeek(occSpark))),
      spark: occSpark,
    },
    adr: {
      current: adrSpark[adrSpark.length - 1] ?? 0,
      delta: pctDelta(avg(lastWeek(adrSpark)), avg(prevWeek(adrSpark))),
      spark: adrSpark,
    },
    revpar: {
      current: revparSpark[revparSpark.length - 1] ?? 0,
      delta: pctDelta(avg(lastWeek(revparSpark)), avg(prevWeek(revparSpark))),
      spark: revparSpark,
    },
    bookings: {
      current: todayCreatedCount,
      delta: pctDelta(todayCreatedCount, prevWeekCreatedCount / 7),
      spark: bookSpark,
    },
  };
}

// ─── Channel mix (MTD) ────────────────────────────────────────────────────

export interface ChannelMixRow {
  id: ChannelId;
  pct: number;
  revenue: number;
  bookings: number;
}

export async function getChannelMix(): Promise<ChannelMixRow[]> {
  const hotelId = await currentHotelId();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const rows = await prisma.booking.findMany({
    where: {
      hotelId,
      status: { not: "cancelled" },
      checkIn: { gte: monthStart },
    },
    select: { total: true, channel: { select: { type: true } } },
  });

  const byChannel = new Map<ChannelId, { revenue: number; bookings: number }>();
  for (const b of rows) {
    const ch = asChannelId(b.channel?.type);
    const cur = byChannel.get(ch) ?? { revenue: 0, bookings: 0 };
    cur.revenue += b.total;
    cur.bookings += 1;
    byChannel.set(ch, cur);
  }
  const total = Array.from(byChannel.values()).reduce((s, v) => s + v.revenue, 0) || 1;
  return Array.from(byChannel.entries())
    .map(([id, v]) => ({ id, revenue: v.revenue, bookings: v.bookings, pct: Math.round((v.revenue / total) * 100) }))
    .sort((a, b) => b.revenue - a.revenue);
}

// ─── AI rate recommendations ──────────────────────────────────────────────

export interface RateRecommendation {
  date: string;
  roomTypeId: string;
  roomTypeName: string;
  /** Channel the recommendation is keyed to (we suggest applying to all CAL_CHANNELS but show the highest-grossing one). */
  topChannel: ChannelId;
  currentRate: number;
  suggestedRate: number;
  /** Comp-set average pulled from competitor rate-shop (mocked) */
  compAvg: number;
  /** Optional market event for that date */
  event: string | null;
  /** -100..100 percent diff */
  deltaPct: number;
  reason: string;
  occupancyPct: number;
  /** Source of the suggestion: "ml" (regression) or "heuristic" (rule-based fallback). */
  source: "ml" | "heuristic";
  /** Model confidence: low / ok / good (only meaningful when source="ml"). */
  confidence?: "low" | "ok" | "good";
  /** Per-feature contribution to the predicted rate (only when source="ml"). */
  explanation?: { label: string; contribution: number; featureValue: number }[];
}

export interface AiRecommendationSummary {
  recs: RateRecommendation[];
  /** Sum of (suggested - current) × estimated nights for the next 14 days. */
  extraRevenueNext14: number;
  /** Model meta — null when no rt has enough data. */
  model: {
    /** Total training samples across all room types. */
    totalSamples: number;
    /** Number of room types with usable models (confidence >= ok). */
    roomTypesWithModel: number;
    /** Avg training MAE across usable models. */
    avgTrainMae: number;
  } | null;
}

export async function getRateRecommendations(days = 14): Promise<AiRecommendationSummary> {
  const hotelId = await currentHotelId();
  const start = startOfTodayUtc();
  const end = addDays(start, days);

  // Lazy-import the ML module so client bundles never see server-only code.
  const { learnHotelRateModel, predictRate, explainPrediction } = await import("./ml-rates");
  const modelByRt = await learnHotelRateModel(hotelId, 90);

  const [roomTypes, rates, bookings] = await Promise.all([
    prisma.roomType.findMany({
      where: { hotelId },
      include: { rooms: { select: { id: true } } },
      orderBy: { baseRate: "asc" },
    }),
    prisma.rate.findMany({
      where: { roomType: { hotelId }, date: { gte: start, lt: end }, ratePlan: { name: "Standard" } },
      include: { channel: { select: { type: true } } },
    }),
    prisma.booking.findMany({
      where: {
        hotelId,
        status: { in: ["confirmed", "in_house"] },
        checkIn: { lt: end },
        checkOut: { gt: start },
      },
      select: { roomTypeId: true, checkIn: true, checkOut: true },
    }),
  ]);

  // Occupancy per (roomType, dateOffset)
  const occMap = new Map<string, number>();
  for (const b of bookings) {
    const startOff = Math.max(0, Math.floor((b.checkIn.getTime() - start.getTime()) / 86_400_000));
    const endOff = Math.min(days - 1, Math.floor((b.checkOut.getTime() - 86_400_000 - start.getTime()) / 86_400_000));
    for (let i = startOff; i <= endOff; i++) {
      const key = `${b.roomTypeId}:${i}`;
      occMap.set(key, (occMap.get(key) ?? 0) + 1);
    }
  }

  // Find current "Airbnb" rate per (rt, day) as anchor — that's the most-used channel
  const rateAnchor = new Map<string, number>(); // `${rtId}:${iso}` → amount
  for (const r of rates) {
    if (r.channel?.type !== "airbnb") continue;
    rateAnchor.set(`${r.roomTypeId}:${isoDate(r.date)}`, r.amount);
  }

  const recs: RateRecommendation[] = [];
  let extraRevenue = 0;

  for (const rt of roomTypes) {
    const capacity = Math.max(1, rt.rooms.length);
    for (let i = 0; i < days; i++) {
      const date = addDays(start, i);
      const iso = isoDate(date);
      const dow = date.getUTCDay();
      const isWeekend = dow === 5 || dow === 6;
      const occ = occMap.get(`${rt.id}:${i}`) ?? 0;
      const occRatio = occ / capacity;

      const current = rateAnchor.get(`${rt.id}:${iso}`) ?? rt.baseRate;
      const compAvg = competitorAvgRate(rt.id, iso, rt.baseRate);
      const event = eventFor(iso);
      let multiplier = 1.0;
      const reasons: string[] = [];

      if (occRatio >= 0.85) {
        multiplier += 0.18;
        reasons.push("높은 점유율");
      } else if (occRatio >= 0.65) {
        multiplier += 0.08;
        reasons.push("점유율 상승");
      } else if (occRatio < 0.3 && i > 2) {
        multiplier -= 0.05;
        reasons.push("낮은 점유율");
      }

      if (isWeekend && occRatio >= 0.6) {
        multiplier += 0.05;
        reasons.push("주말 수요");
      }

      if (i <= 2 && occRatio >= 0.7) {
        multiplier += 0.04;
        reasons.push("임박 예약");
      }

      // Competitor parity: if we're >8% under comp set avg, gently bump up
      const compRatio = current / compAvg;
      if (compRatio < 0.92) {
        multiplier += 0.06;
        reasons.push(`경쟁사 대비 -${Math.round((1 - compRatio) * 100)}%`);
      } else if (compRatio > 1.12 && occRatio < 0.6) {
        multiplier -= 0.04;
        reasons.push("경쟁사 대비 고가");
      }

      // Event multiplier — apply directly
      if (event) {
        multiplier *= event.multiplier;
        reasons.push(event.label);
      }

      const heuristicSuggested = Math.round((current * multiplier) / 1000) * 1000;

      // ML prediction (preferred). If model is low-confidence or returns
      // an absurd value, fall back to the heuristic.
      const model = modelByRt.get(rt.id);
      const mlPredicted = model ? predictRate(model, { roomTypeId: rt.id, iso, occRatio, leadTimeDays: i }) : null;

      let suggested: number;
      let source: "ml" | "heuristic";
      let confidence: "low" | "ok" | "good" | undefined;
      let explanation: { label: string; contribution: number; featureValue: number }[] | undefined;
      if (mlPredicted !== null && model && model.confidence !== "low") {
        // Sanity clamp: never suggest more than ±50% from current rate via ML —
        // protects against extrapolation outside the training distribution.
        const lo = Math.round(current * 0.5);
        const hi = Math.round(current * 1.5);
        suggested = Math.max(lo, Math.min(hi, mlPredicted));
        source = "ml";
        confidence = model.confidence;
        const expl = explainPrediction(model, { roomTypeId: rt.id, iso, occRatio, leadTimeDays: i });
        if (expl) explanation = expl;
        if (event) {
          // Apply event uplift on top of the ML baseline.
          suggested = Math.round((suggested * event.multiplier) / 1000) * 1000;
          reasons.push(event.label);
        }
        // Surface the model confidence in the reason string.
        reasons.unshift(`ML(${model.confidence}, n=${model.n})`);
      } else {
        suggested = heuristicSuggested;
        source = "heuristic";
      }

      const deltaPct = current === 0 ? 0 : Math.round(((suggested - current) / current) * 1000) / 10;

      // Only recommend if change ≥ 3%
      if (Math.abs(deltaPct) < 3) continue;

      recs.push({
        date: iso,
        roomTypeId: rt.id,
        roomTypeName: rt.name,
        topChannel: "airbnb",
        currentRate: current,
        suggestedRate: suggested,
        compAvg,
        event: event?.label ?? null,
        deltaPct,
        reason: reasons.join(" · ") || (deltaPct > 0 ? "수요 상승" : "수요 하락"),
        occupancyPct: Math.round(occRatio * 100),
        source,
        confidence,
        explanation,
      });

      // Extra revenue projection: assume 1 incremental sale at the suggested price for upsell days
      if (deltaPct > 0) {
        extraRevenue += suggested - current;
      }
    }
  }

  // Show top 5 by absolute delta
  recs.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));

  // Model meta: aggregate across room types
  const usableModels = Array.from(modelByRt.values()).filter((m) => m.confidence !== "low");
  const totalSamples = Array.from(modelByRt.values()).reduce((s, m) => s + m.n, 0);
  const model = usableModels.length > 0
    ? {
        totalSamples,
        roomTypesWithModel: usableModels.length,
        avgTrainMae: Math.round(usableModels.reduce((s, m) => s + m.trainMae, 0) / usableModels.length),
      }
    : null;

  return { recs: recs.slice(0, 5), extraRevenueNext14: extraRevenue, model };
}

// ─── Command palette (⌘K) ─────────────────────────────────────────────────

export type CommandKind = "booking" | "thread" | "channel" | "page";

export interface CommandItem {
  id: string;
  kind: CommandKind;
  label: string;
  sub: string | null;
  href: string;
  hint: string | null;
}

export async function searchCommands(query: string, limit = 30): Promise<CommandItem[]> {
  const hotelId = await currentHotelId();
  const q = query.trim();
  const items: CommandItem[] = [];

  // Static page shortcuts always present
  const PAGES: CommandItem[] = [
    { id: "p:dashboard", kind: "page", label: "대시보드 / Dashboard", sub: null, href: "/", hint: "G D" },
    { id: "p:calendar", kind: "page", label: "캘린더 / Calendar", sub: null, href: "/calendar", hint: "G C" },
    { id: "p:bookings", kind: "page", label: "예약 / Bookings", sub: null, href: "/bookings", hint: "G B" },
    { id: "p:messages", kind: "page", label: "메시지 / Messages", sub: null, href: "/messages", hint: "G M" },
    { id: "p:channels", kind: "page", label: "채널 / Channels", sub: null, href: "/channels", hint: null },
    { id: "p:rooms", kind: "page", label: "객실 / Rooms", sub: null, href: "/rooms", hint: null },
    { id: "p:revenue", kind: "page", label: "수익 / Revenue", sub: null, href: "/revenue", hint: null },
    { id: "p:automations", kind: "page", label: "자동화 / Automations", sub: null, href: "/automations", hint: null },
    { id: "p:settings", kind: "page", label: "설정 / Settings", sub: null, href: "/settings", hint: null },
    { id: "p:settings-team", kind: "page", label: "팀 / Team", sub: null, href: "/settings/team", hint: null },
    { id: "p:settings-email", kind: "page", label: "이메일 템플릿 / Email templates", sub: null, href: "/settings/email-templates", hint: null },
    { id: "p:settings-webhooks", kind: "page", label: "Webhook 로그 / Webhook log", sub: null, href: "/settings/webhooks", hint: null },
    { id: "p:admin-hotels", kind: "page", label: "호텔 관리 / Hotel admin", sub: null, href: "/admin/hotels", hint: null },
    { id: "p:settings-import", kind: "page", label: "CSV 가져오기 / CSV import", sub: null, href: "/settings/import", hint: null },
    { id: "p:settings-privacy", kind: "page", label: "개인정보 / Privacy", sub: null, href: "/settings/privacy", hint: null },
    { id: "p:settings-billing", kind: "page", label: "구독 / Billing", sub: null, href: "/settings/billing", hint: null },
    { id: "p:onboarding", kind: "page", label: "온보딩 / Onboarding", sub: null, href: "/onboarding", hint: null },
    { id: "p:settings-integrations", kind: "page", label: "Slack / Discord 연동 / Integrations", sub: null, href: "/settings/integrations", hint: null },
    { id: "p:admin-perf", kind: "page", label: "성능 / Performance", sub: null, href: "/admin/perf", hint: null },
    { id: "p:guests", kind: "page", label: "게스트 / Guests", sub: null, href: "/guests", hint: null },
    { id: "p:housekeeping", kind: "page", label: "객실 현황 / Housekeeping", sub: null, href: "/housekeeping", hint: null },
    { id: "p:analytics", kind: "page", label: "분석 / Analytics", sub: null, href: "/analytics", hint: null },
  ];
  const lower = q.toLowerCase();
  for (const p of PAGES) {
    if (!q || p.label.toLowerCase().includes(lower)) items.push(p);
  }

  if (q.length === 0) {
    return items.slice(0, limit);
  }

  // Bookings: search guest name + externalRef
  const bookings = await prisma.booking.findMany({
    where: {
      hotelId,
      OR: [
        { guest: { name: { contains: q, mode: "insensitive" } } },
        { externalRef: { contains: q, mode: "insensitive" } },
      ],
    },
    include: { guest: { select: { name: true } }, channel: { select: { type: true } } },
    take: 10,
  });
  for (const b of bookings) {
    items.push({
      id: `b:${b.id}`,
      kind: "booking",
      label: `${b.guest.name} · ${b.externalRef ?? b.id.slice(-8).toUpperCase()}`,
      sub: `${asChannelId(b.channel?.type)} · ${isoDate(b.checkIn)} → ${isoDate(b.checkOut)} · ₩${b.total.toLocaleString()}`,
      href: `/bookings`,
      hint: null,
    });
  }

  // Threads: search guest name (already covered above for booking, but also surface as message link)
  const threads = await prisma.thread.findMany({
    where: { hotelId, guest: { name: { contains: q, mode: "insensitive" } } },
    include: { guest: { select: { name: true } }, channel: { select: { type: true } } },
    take: 5,
  });
  for (const t of threads) {
    items.push({
      id: `t:${t.id}`,
      kind: "thread",
      label: t.guest.name,
      sub: `메시지 · ${asChannelId(t.channel?.type)}`,
      href: `/messages?thread=${t.id}`,
      hint: null,
    });
  }

  // Channels: simple type prefix match
  const allChannelTypes = ["airbnb", "booking", "agoda", "trip", "direct", "fb"] as const;
  for (const ct of allChannelTypes) {
    if (ct.includes(lower)) {
      items.push({
        id: `c:${ct}`,
        kind: "channel",
        label: ct,
        sub: "채널 설정",
        href: "/channels",
        hint: null,
      });
    }
  }

  return items.slice(0, limit);
}

// ─── Activity feed (notifications) ────────────────────────────────────────

export type ActivityKind = "booking_event" | "sync_log" | "message";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  occurredAt: string;
  /** Short title, already localized into KO (the only seeded language). */
  title: string;
  sub: string | null;
  channel: ChannelId | null;
  /** Where to navigate when clicked. */
  href: string;
  /** True when occurredAt is within the last 60 minutes (used for "new" badge). */
  recent: boolean;
}

const EVENT_LABEL_KO: Record<BookingEventType, string> = {
  created: "신규 예약",
  payment_captured: "결제 완료",
  payment_failed: "결제 실패",
  payment_refunded: "환불",
  confirmation_sent: "확인 메일 발송",
  message_received: "게스트 메시지",
  checked_in: "체크인",
  checked_out: "체크아웃",
  cancelled: "예약 취소",
  self_check_in: "셀프 체크인",
};

const SYNC_OP_LABEL_KO: Record<SyncOp, string> = {
  push_inventory: "재고 푸시",
  push_rates: "가격 푸시",
  pull_bookings: "예약 가져오기",
  rate_mismatch: "가격 충돌",
};

export async function getRecentActivity(limit = 20): Promise<ActivityItem[]> {
  const hotelId = await currentHotelId();
  const now = new Date();
  const recencyCutoff = new Date(now.getTime() - 60 * 60_000);

  const [events, logs, messages] = await Promise.all([
    prisma.bookingEvent.findMany({
      where: { booking: { hotelId }, occurredAt: { lte: now } },
      include: {
        booking: { include: { guest: { select: { name: true } }, channel: { select: { type: true } } } },
      },
      orderBy: { occurredAt: "desc" },
      take: limit,
    }),
    prisma.syncLog.findMany({
      where: { channel: { hotelId }, result: { in: ["warn", "error"] }, occurredAt: { lte: now } },
      include: { channel: { select: { type: true } } },
      orderBy: { occurredAt: "desc" },
      take: limit,
    }),
    prisma.message.findMany({
      where: { thread: { hotelId }, sender: "guest", createdAt: { lte: now } },
      include: { thread: { include: { guest: { select: { name: true } }, channel: { select: { type: true } } } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  const items: ActivityItem[] = [];

  for (const e of events) {
    items.push({
      id: `evt:${e.id}`,
      kind: "booking_event",
      occurredAt: e.occurredAt.toISOString(),
      title: `${EVENT_LABEL_KO[e.type]} · ${e.booking.guest.name}`,
      sub: e.body ?? (e.booking.externalRef ?? null),
      channel: e.booking.channel ? asChannelId(e.booking.channel.type) : null,
      href: "/bookings",
      recent: e.occurredAt >= recencyCutoff,
    });
  }
  for (const l of logs) {
    items.push({
      id: `log:${l.id}`,
      kind: "sync_log",
      occurredAt: l.occurredAt.toISOString(),
      title: `${SYNC_OP_LABEL_KO[l.op]} ${l.result === "error" ? "실패" : "지연"}`,
      sub: l.note ?? l.target,
      channel: asChannelId(l.channel.type),
      href: "/channels",
      recent: l.occurredAt >= recencyCutoff,
    });
  }
  for (const m of messages) {
    items.push({
      id: `msg:${m.id}`,
      kind: "message",
      occurredAt: m.createdAt.toISOString(),
      title: `메시지 · ${m.thread.guest.name}`,
      sub: m.body.length > 60 ? m.body.slice(0, 57) + "…" : m.body,
      channel: m.thread.channel ? asChannelId(m.thread.channel.type) : null,
      href: "/messages",
      recent: m.createdAt >= recencyCutoff,
    });
  }

  return items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, limit);
}

// ─── Messages ─────────────────────────────────────────────────────────────

export interface MessageRow {
  id: string;
  sender: MessageSender;
  body: string;
  createdAt: string;
}

export type SlaTier = "fresh" | "warning" | "stale" | null;

export interface ThreadRow {
  id: string;
  guestName: string;
  guestFlag: string;
  guestCountry: string | null;
  channel: ChannelId;
  unread: number;
  lastMessageAt: string;
  lastSnippet: string;
  messages: MessageRow[];
  /** Most recent booking external ref for context */
  bookingRef: string | null;
  bookingTotal: number | null;
  bookingCheckIn: string | null;
  bookingCheckOut: string | null;
  bookingRoomType: string | null;
  /** ISO of the last UNANSWERED guest message (i.e. nothing from host since).
   *  null when guest has been replied to or never wrote. */
  awaitingSinceIso: string | null;
  /** Hours since `awaitingSinceIso`. 0 when not awaiting. Used for SLA tiering. */
  awaitingHours: number;
  /** SLA tier: fresh (<1h), warning (1–4h), stale (>4h), null (not awaiting). */
  slaTier: SlaTier;
}

export async function getMessageThreads(): Promise<ThreadRow[]> {
  const hotelId = await currentHotelId();
  const threads = await prisma.thread.findMany({
    where: { hotelId },
    include: {
      guest: { select: { name: true, country: true, email: true } },
      channel: { select: { type: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  // For each thread, find the guest's most recent booking on this channel for context
  const guestChannelPairs = threads.map((t) => ({ guestId: t.guestId, channelId: t.channelId }));
  const bookingsByPair = new Map<string, { externalRef: string | null; total: number; checkIn: Date; checkOut: Date; roomType: string }>();
  if (guestChannelPairs.length > 0) {
    const bookings = await prisma.booking.findMany({
      where: {
        OR: guestChannelPairs.map((p) => ({
          guestId: p.guestId,
          channelId: p.channelId ?? undefined,
        })),
      },
      include: { roomType: { select: { name: true } } },
      orderBy: { checkIn: "desc" },
    });
    for (const b of bookings) {
      const key = `${b.guestId}:${b.channelId ?? ""}`;
      if (!bookingsByPair.has(key)) {
        bookingsByPair.set(key, {
          externalRef: b.externalRef,
          total: b.total,
          checkIn: b.checkIn,
          checkOut: b.checkOut,
          roomType: b.roomType.name,
        });
      }
    }
  }

  const now = Date.now();
  return threads.map((t) => {
    const lastMsg = t.messages.filter((m) => m.sender !== "system").at(-1);
    const ctx = bookingsByPair.get(`${t.guestId}:${t.channelId ?? ""}`);

    // SLA: walk messages newest-first to find the oldest unanswered guest msg.
    // A guest message is "answered" if there's a host message at-or-after it.
    let awaitingSince: Date | null = null;
    for (let i = t.messages.length - 1; i >= 0; i--) {
      const m = t.messages[i];
      if (m.sender === "host") break; // most recent host reply — everything before is answered
      if (m.sender === "guest") awaitingSince = m.createdAt;
    }
    const awaitingHours = awaitingSince
      ? Math.max(0, (now - awaitingSince.getTime()) / 3_600_000)
      : 0;
    const slaTier: SlaTier = !awaitingSince
      ? null
      : awaitingHours < 1
      ? "fresh"
      : awaitingHours < 4
      ? "warning"
      : "stale";

    return {
      id: t.id,
      guestName: t.guest.name,
      guestFlag: COUNTRY_FLAGS[t.guest.country ?? ""] ?? "🏳️",
      guestCountry: t.guest.country,
      channel: asChannelId(t.channel?.type),
      unread: t.unreadCount,
      lastMessageAt: t.lastMessageAt.toISOString(),
      lastSnippet: lastMsg?.body ?? "",
      messages: t.messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      })),
      awaitingSinceIso: awaitingSince?.toISOString() ?? null,
      awaitingHours: Math.round(awaitingHours * 10) / 10,
      slaTier,
      bookingRef: ctx?.externalRef ?? null,
      bookingTotal: ctx?.total ?? null,
      bookingCheckIn: ctx ? isoDate(ctx.checkIn) : null,
      bookingCheckOut: ctx ? isoDate(ctx.checkOut) : null,
      bookingRoomType: ctx?.roomType ?? null,
    };
  });
}

export interface SavedReplyRow {
  id: string;
  label: string;
  body: string;
}

export async function getSavedReplies(): Promise<SavedReplyRow[]> {
  const hotelId = await currentHotelId();
  const rows = await prisma.savedReply.findMany({ where: { hotelId }, orderBy: { label: "asc" } });
  return rows.map((r) => ({ id: r.id, label: r.label, body: r.body }));
}

// ─── Guest CRM list (for /guests) ──────────────────────────────────────

export interface GuestCrmFilter {
  /** Free-text over name + email + phone. */
  q?: string;
  /** Country ISO codes to include. */
  countries?: string[];
  /** Tag names to filter by (any-match). */
  tags?: string[];
  /** Min lifetime revenue (KRW). */
  minLtv?: number;
  /** Only guests with future bookings. */
  hasUpcoming?: boolean;
}

export interface GuestCrmRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  countryFlag: string;
  language: string | null;
  tags: string[];
  ltv: number;
  bookings: number;
  lastStayIso: string | null;
  nextStayIso: string | null;
}

export interface GuestCrmPage {
  rows: GuestCrmRow[];
  /** Total matching after LTV+upcoming filters (pre-pagination). */
  total: number;
  /** Distinct country codes across the hotel — for the filter facet. */
  countryFacet: string[];
  /** Distinct tags across the hotel. */
  tagFacet: string[];
}

export async function getGuestCrm(filter: GuestCrmFilter = {}, limit = 200): Promise<GuestCrmPage> {
  const hotelId = await currentHotelId();
  const q = filter.q?.trim();
  const guests = await prisma.guest.findMany({
    where: {
      hotelId,
      ...(filter.countries && filter.countries.length > 0 ? { country: { in: filter.countries } } : {}),
      ...(filter.tags && filter.tags.length > 0 ? { tags: { hasSome: filter.tags } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    },
    include: {
      bookings: {
        where: { status: { not: "cancelled" } },
        select: { total: true, checkIn: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const now = Date.now();
  const rows: GuestCrmRow[] = [];
  for (const g of guests) {
    const ltv = g.bookings.reduce((s, b) => s + b.total, 0);
    const checkIns = g.bookings.map((b) => b.checkIn.getTime()).sort((a, b) => b - a);
    const lastStay = checkIns[0] ?? null;
    const nextStay = g.bookings
      .map((b) => b.checkIn.getTime())
      .filter((t) => t >= now)
      .sort((a, b) => a - b)[0] ?? null;

    if (filter.minLtv && ltv < filter.minLtv) continue;
    if (filter.hasUpcoming && !nextStay) continue;

    rows.push({
      id: g.id,
      name: g.name,
      email: g.email,
      phone: g.phone,
      country: g.country,
      countryFlag: COUNTRY_FLAGS[g.country ?? ""] ?? "🏳️",
      language: g.language,
      tags: g.tags,
      ltv,
      bookings: g.bookings.length,
      lastStayIso: lastStay ? new Date(lastStay).toISOString().slice(0, 10) : null,
      nextStayIso: nextStay ? new Date(nextStay).toISOString().slice(0, 10) : null,
    });
  }
  rows.sort((a, b) => b.ltv - a.ltv);

  // Facets — pulled once across all guests of the hotel (unfiltered)
  const allGuests = await prisma.guest.findMany({
    where: { hotelId },
    select: { country: true, tags: true },
  });
  const countrySet = new Set<string>();
  const tagSet = new Set<string>();
  for (const g of allGuests) {
    if (g.country) countrySet.add(g.country);
    for (const t of g.tags) tagSet.add(t);
  }

  return {
    rows: rows.slice(0, limit),
    total: rows.length,
    countryFacet: Array.from(countrySet).sort(),
    tagFacet: Array.from(tagSet).sort(),
  };
}

// ─── Guest profile (for /guests/[id]) ──────────────────────────────────

export interface GuestTimelineEntry {
  /** Stable id for React keys. */
  id: string;
  kind: "booking" | "event" | "message";
  occurredAt: string;
  title: string;
  sub: string;
  /** Channel context (when known) for the strip indicator. */
  channel: ChannelId | null;
  /** Optional href for the row to link to (booking detail, thread). */
  href?: string | null;
}

export interface GuestProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  countryFlag: string;
  language: string | null;
  notes: string | null;
  tags: string[];
  /** GDPR: ISO when the operator requested erasure, null when active. */
  deletionRequestedAt: string | null;
  createdAtIso: string;
  /** Lifetime stats — sums non-cancelled bookings only (matches getBookings semantics). */
  ltv: {
    bookingsCount: number;
    revenue: number;
    nights: number;
    firstStayIso: string | null;
    lastStayIso: string | null;
    avgPerNight: number;
  };
  /** Cancelled count — informational, NOT included in revenue/nights. */
  cancelledCount: number;
  /** Newest-first merged timeline of bookings + events + messages. Capped at 50. */
  timeline: GuestTimelineEntry[];
  /** Future bookings (next 5). */
  upcoming: { id: string; bookingRef: string | null; checkIn: string; checkOut: string; roomType: string; status: string; channel: ChannelId }[];
}

export async function getGuestProfile(guestId: string): Promise<GuestProfile | null> {
  const hotelId = await currentHotelId();
  const guest = await prisma.guest.findFirst({
    where: { id: guestId, hotelId },
    include: {
      bookings: {
        orderBy: { checkIn: "desc" },
        include: {
          channel: { select: { type: true } },
          roomType: { select: { name: true } },
          events: { orderBy: { occurredAt: "desc" }, take: 30 },
        },
      },
      threads: {
        include: { messages: { orderBy: { createdAt: "desc" }, take: 5 }, channel: { select: { type: true } } },
        orderBy: { lastMessageAt: "desc" },
      },
    },
  });
  if (!guest) return null;

  // ── LTV (sums NON-cancelled only) ──────────────────────────────────
  const active = guest.bookings.filter((b) => b.status !== "cancelled");
  const cancelledCount = guest.bookings.length - active.length;
  const revenue = active.reduce((s, b) => s + b.total, 0);
  const nights = active.reduce((s, b) => {
    const n = Math.max(1, Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / 86_400_000));
    return s + n;
  }, 0);
  const firstStay = active.length > 0 ? active[active.length - 1].checkIn : null;
  const lastStay = active.length > 0 ? active[0].checkIn : null;

  // ── Timeline (newest-first merge) ──────────────────────────────────
  const tl: GuestTimelineEntry[] = [];
  for (const b of guest.bookings) {
    const ch = asChannelId(b.channel?.type);
    tl.push({
      id: `b:${b.id}`,
      kind: "booking",
      occurredAt: b.createdAt.toISOString(),
      title: `${b.status} · ${b.roomType.name} · ₩${b.total.toLocaleString()}`,
      sub: `${isoDate(b.checkIn)} → ${isoDate(b.checkOut)}${b.externalRef ? ` · ${b.externalRef}` : ""}`,
      channel: ch,
      href: "/bookings",
    });
    for (const e of b.events) {
      // Skip the cron's idempotency-tag events (auto:*) from the user-facing timeline.
      if (e.body?.startsWith("auto:")) continue;
      tl.push({
        id: `e:${e.id}`,
        kind: "event",
        occurredAt: e.occurredAt.toISOString(),
        title: String(e.type).replace(/_/g, " "),
        sub: e.body ?? "",
        channel: ch,
      });
    }
  }
  for (const t of guest.threads) {
    const ch = asChannelId(t.channel?.type);
    for (const m of t.messages) {
      tl.push({
        id: `m:${m.id}`,
        kind: "message",
        occurredAt: m.createdAt.toISOString(),
        title: `${m.sender}: ${m.body.slice(0, 60)}${m.body.length > 60 ? "…" : ""}`,
        sub: ch ?? "",
        channel: ch,
        href: `/messages?thread=${t.id}`,
      });
    }
  }
  tl.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));

  // ── Upcoming (next 5 future check-ins) ─────────────────────────────
  const todayMs = Date.now();
  const upcoming = active
    .filter((b) => b.checkIn.getTime() >= todayMs)
    .slice(0, 5)
    .reverse() // back to ascending order
    .map((b) => ({
      id: b.id,
      bookingRef: b.externalRef,
      checkIn: isoDate(b.checkIn),
      checkOut: isoDate(b.checkOut),
      roomType: b.roomType.name,
      status: b.status,
      channel: asChannelId(b.channel?.type),
    }));

  return {
    id: guest.id,
    name: guest.name,
    email: guest.email,
    phone: guest.phone,
    country: guest.country,
    countryFlag: COUNTRY_FLAGS[guest.country ?? ""] ?? "🏳️",
    language: guest.language,
    notes: guest.notes,
    tags: guest.tags,
    deletionRequestedAt: guest.deletionRequestedAt?.toISOString() ?? null,
    createdAtIso: guest.createdAt.toISOString(),
    ltv: {
      bookingsCount: active.length,
      revenue,
      nights,
      firstStayIso: firstStay ? isoDate(firstStay) : null,
      lastStayIso: lastStay ? isoDate(lastStay) : null,
      avgPerNight: nights > 0 ? Math.round(revenue / nights) : 0,
    },
    cancelledCount,
    timeline: tl.slice(0, 50),
    upcoming,
  };
}

// ─── Email templates (for /settings/email-templates) ──────────────────

export type EmailTemplateKindStr = "checkin_reminder" | "review_request" | "payment_failed";

export interface EmailTemplateRow {
  /** null when only the built-in default exists (no per-hotel override). */
  id: string | null;
  kind: EmailTemplateKindStr;
  subject: string;
  body: string;
  enabled: boolean;
  /** Built-in fallback values, always populated so the UI can show a "Reset to default" preview. */
  defaultSubject: string;
  defaultBody: string;
}

const TEMPLATE_KINDS: EmailTemplateKindStr[] = ["checkin_reminder", "review_request", "payment_failed"];

export async function getEmailTemplates(): Promise<EmailTemplateRow[]> {
  const hotelId = await currentHotelId();
  // Lazy import to avoid pulling server-only modules into client bundles
  // through transitive imports (queries.ts is imported widely).
  const { defaultTemplate } = await import("./email-templates");
  const overrides = await prisma.emailTemplate.findMany({ where: { hotelId } });
  const byKind = new Map(overrides.map((o) => [o.kind, o] as const));
  return TEMPLATE_KINDS.map((kind) => {
    const def = defaultTemplate(kind);
    const o = byKind.get(kind);
    return {
      id: o?.id ?? null,
      kind,
      subject: o?.subject ?? def.subject,
      body: o?.body ?? def.body,
      enabled: o?.enabled ?? true,
      defaultSubject: def.subject,
      defaultBody: def.body,
    };
  });
}

// ─── Webhook log (for /settings/webhooks) ─────────────────────────────

export type WebhookProviderStr = "clerk" | "stripe" | "booking_com" | "hostaway";
export type WebhookStatusStr = "ok" | "invalid_signature" | "bad_request" | "handler_error";

export interface WebhookLogRow {
  id: string;
  provider: WebhookProviderStr;
  eventType: string | null;
  status: WebhookStatusStr;
  httpStatus: number;
  responseBody: string | null;
  durationMs: number;
  receivedAt: string;
}

export interface WebhookLogDetail extends WebhookLogRow {
  headers: Record<string, string>;
  body: string;
}

export async function getWebhookLogs(limit = 100): Promise<WebhookLogRow[]> {
  // Cross-tenant by design: webhook signing identifies the app, not a hotel.
  // The /settings/webhooks page is owner-only (assumed) so this is fine.
  const rows = await prisma.webhookLog.findMany({
    orderBy: { receivedAt: "desc" },
    take: limit,
    select: {
      id: true,
      provider: true,
      eventType: true,
      status: true,
      httpStatus: true,
      responseBody: true,
      durationMs: true,
      receivedAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    eventType: r.eventType,
    status: r.status,
    httpStatus: r.httpStatus,
    responseBody: r.responseBody,
    durationMs: r.durationMs,
    receivedAt: r.receivedAt.toISOString(),
  }));
}

export async function getWebhookLogDetail(id: string): Promise<WebhookLogDetail | null> {
  const row = await prisma.webhookLog.findUnique({ where: { id } });
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    eventType: row.eventType,
    status: row.status,
    httpStatus: row.httpStatus,
    responseBody: row.responseBody,
    durationMs: row.durationMs,
    receivedAt: row.receivedAt.toISOString(),
    headers: (row.headers ?? {}) as Record<string, string>,
    body: row.body,
  };
}

// ─── Advanced analytics (for /analytics) ─────────────────────────────

/**
 * Booking lifecycle funnel + per-channel attribution + guest-cohort retention
 * + 30-day revenue forecast. The dashboard `/analytics` consumes the whole
 * `AnalyticsOverview` so we make one round-trip from the page.
 *
 * Forecast model: per-(roomType, day-of-week) avg ADR over the past 90 days,
 * multiplied by historical occupancy curve, then adjusted by upcoming-event
 * multipliers from `market.ts`. Same family as `getOccupancyTrend` but
 * extrapolated 30d forward.
 */

export interface FunnelStep {
  /** Stage label key (UI translates). */
  key: "created" | "confirmed" | "in_house" | "checked_out" | "reviewed";
  count: number;
  /** Conversion vs the previous step (0..1). The first step is 1. */
  convFromPrev: number;
}

export interface CohortRow {
  /** YYYY-MM of the guest's first stay. */
  cohort: string;
  /** Number of guests in this cohort. */
  size: number;
  /** Per offset (months 0..5), share who returned for another stay (0..1). */
  retention: number[];
}

export interface ForecastPoint {
  iso: string;
  /** Predicted ADR (KRW, rounded). */
  adr: number;
  /** Predicted occupancy ratio (0..1). */
  occupancy: number;
  /** Predicted RevPAR = adr * occupancy. */
  revpar: number;
  /** Optional event label affecting the day. */
  event: string | null;
}

export interface ChannelAttribution {
  channel: ChannelId;
  bookingsCount: number;
  /** Gross revenue this window (cancelled excluded). */
  revenue: number;
  /** % of total revenue. */
  share: number;
  /** Avg booking value. */
  avg: number;
}

export interface AnalyticsOverview {
  funnel: FunnelStep[];
  cohorts: CohortRow[];
  forecast: ForecastPoint[];
  attribution: ChannelAttribution[];
  /** Sum of forecast.revpar * roomCount for the next 30 days (KRW). */
  forecast30dRevenue: number;
  /** Window the analytics cover (last 90d for funnel + cohort). */
  windowStart: string;
  windowEnd: string;
}

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  const hotelId = await currentHotelId();
  const today = startOfTodayUtc();
  const since90 = addDays(today, -90);
  const sinceCohort = addDays(today, -180); // 6 months back for cohort table

  const [allBookings, totalRoomCount] = await Promise.all([
    prisma.booking.findMany({
      where: { hotelId, createdAt: { gte: sinceCohort } },
      include: {
        channel: { select: { type: true } },
        events: { select: { type: true } },
      },
    }),
    prisma.room.count({ where: { roomType: { hotelId } } }),
  ]);

  // ── 1. Funnel ────────────────────────────────────────────────────────
  // Counts in last 90 days. A booking that ended up checked_out also went
  // through confirmed + in_house, so we count "ever reached this state".
  const last90 = allBookings.filter((b) => b.createdAt >= since90);
  const created = last90.length;
  const confirmed = last90.filter((b) =>
    // Anything past `created` status implies confirmation.
    b.status !== "cancelled",
  ).length;
  const inHouse = last90.filter((b) =>
    b.status === "in_house" || b.status === "checked_out" ||
    b.events.some((e) => e.type === "checked_in"),
  ).length;
  const checkedOut = last90.filter((b) => b.status === "checked_out").length;
  // Reviewed proxy: BookingEvent body containing "review-request" (host
  // sent the prompt) — sanity floor for the funnel "did we ask for one?"
  const reviewed = last90.filter((b) =>
    b.events.some((e) => (e.type === "message_received") && e.type === "message_received"),
  ).length;

  const funnel: FunnelStep[] = [
    { key: "created",     count: created,    convFromPrev: 1 },
    { key: "confirmed",   count: confirmed,  convFromPrev: created > 0 ? confirmed / created : 0 },
    { key: "in_house",    count: inHouse,    convFromPrev: confirmed > 0 ? inHouse / confirmed : 0 },
    { key: "checked_out", count: checkedOut, convFromPrev: inHouse > 0 ? checkedOut / inHouse : 0 },
    { key: "reviewed",    count: reviewed,   convFromPrev: checkedOut > 0 ? reviewed / checkedOut : 0 },
  ];

  // ── 2. Cohort retention ──────────────────────────────────────────────
  // Group guests by their FIRST non-cancelled checkIn month. For each
  // subsequent month, count what share returned for a stay.
  const guestFirstMonth = new Map<string, string>(); // guestId → YYYY-MM
  const guestStaysByMonth = new Map<string, Set<string>>(); // guestId → set<YYYY-MM>
  for (const b of allBookings) {
    if (b.status === "cancelled") continue;
    const ym = b.checkIn.toISOString().slice(0, 7);
    const cur = guestFirstMonth.get(b.guestId);
    if (!cur || ym < cur) guestFirstMonth.set(b.guestId, ym);
    const set = guestStaysByMonth.get(b.guestId) ?? new Set<string>();
    set.add(ym);
    guestStaysByMonth.set(b.guestId, set);
  }
  const cohortBuckets = new Map<string, string[]>(); // cohort YM → guestIds
  for (const [gid, ym] of guestFirstMonth.entries()) {
    const arr = cohortBuckets.get(ym) ?? [];
    arr.push(gid);
    cohortBuckets.set(ym, arr);
  }
  const sortedCohorts = Array.from(cohortBuckets.keys()).sort().slice(-6); // last 6 months
  const cohorts: CohortRow[] = sortedCohorts.map((ym) => {
    const guestIds = cohortBuckets.get(ym)!;
    const size = guestIds.length;
    const retention: number[] = [];
    const [yStr, mStr] = ym.split("-");
    const baseY = parseInt(yStr, 10);
    const baseM = parseInt(mStr, 10);
    for (let offset = 0; offset < 6; offset++) {
      const dt = new Date(Date.UTC(baseY, baseM - 1 + offset, 1));
      const targetYm = dt.toISOString().slice(0, 7);
      const returned = guestIds.filter((g) => guestStaysByMonth.get(g)?.has(targetYm)).length;
      retention.push(size > 0 ? returned / size : 0);
    }
    return { cohort: ym, size, retention };
  });

  // ── 3. Channel attribution (last 90d) ────────────────────────────────
  const attrMap = new Map<ChannelId, { bookingsCount: number; revenue: number }>();
  let totalRev = 0;
  for (const b of last90) {
    if (b.status === "cancelled") continue;
    const ch = asChannelId(b.channel?.type);
    const cur = attrMap.get(ch) ?? { bookingsCount: 0, revenue: 0 };
    cur.bookingsCount++;
    cur.revenue += b.total;
    attrMap.set(ch, cur);
    totalRev += b.total;
  }
  const attribution: ChannelAttribution[] = Array.from(attrMap.entries())
    .map(([channel, v]) => ({
      channel,
      bookingsCount: v.bookingsCount,
      revenue: v.revenue,
      share: totalRev > 0 ? v.revenue / totalRev : 0,
      avg: v.bookingsCount > 0 ? Math.round(v.revenue / v.bookingsCount) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── 4. Revenue forecast (30d) ────────────────────────────────────────
  // Per day-of-week ADR + occupancy averages from past 90d. Apply event
  // multipliers from market.ts on top. Coarse but usable for ops planning.
  const dowAdr = new Array(7).fill(0).map(() => ({ sum: 0, n: 0 }));
  const dowOcc = new Array(7).fill(0).map(() => ({ sum: 0, n: 0 }));
  for (const b of last90) {
    if (b.status === "cancelled") continue;
    const nights = Math.max(1, Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / 86_400_000));
    const adr = Math.round(b.total / nights);
    const dow = b.checkIn.getUTCDay();
    dowAdr[dow].sum += adr;
    dowAdr[dow].n++;
    dowOcc[dow].sum += 1;
    dowOcc[dow].n++;
  }
  // Avg occupancy ratio per day-of-week — guard against /0 with fall-back.
  const avgAdr: number[] = dowAdr.map((d) => (d.n > 0 ? Math.round(d.sum / d.n) : 100_000));
  const occRatio: number[] = (() => {
    if (totalRoomCount === 0) return new Array(7).fill(0);
    // Use average bookings-per-day-of-week / rooms.
    const daysObserved = Math.max(1, Math.round((today.getTime() - since90.getTime()) / 86_400_000));
    const avgPerDow = daysObserved / 7;
    return dowOcc.map((d) => (d.n > 0 ? Math.min(1, d.sum / avgPerDow / totalRoomCount) : 0));
  })();

  const forecast: ForecastPoint[] = [];
  let forecastRevenue = 0;
  for (let i = 0; i < 30; i++) {
    const date = addDays(today, i);
    const iso = isoDate(date);
    const dow = date.getUTCDay();
    const event = eventFor(iso);
    const mult = event?.multiplier ?? 1.0;
    const adr = Math.round(avgAdr[dow] * mult);
    const occ = Math.min(1, occRatio[dow] * (event ? 1.05 : 1));
    const revpar = Math.round(adr * occ);
    forecast.push({ iso, adr, occupancy: Math.round(occ * 1000) / 1000, revpar, event: event?.label ?? null });
    forecastRevenue += revpar * totalRoomCount;
  }

  return {
    funnel,
    cohorts,
    forecast,
    attribution,
    forecast30dRevenue: forecastRevenue,
    windowStart: isoDate(since90),
    windowEnd: isoDate(today),
  };
}

// ─── Performance / slow-query summary (for /admin/perf) ──────────────

export interface SlowQueryRow {
  id: string;
  occurredAt: string;
  query: string;
  params: string | null;
  durationMs: number;
  endpoint: string | null;
}

export interface PerfOverview {
  /** Configured threshold (from env). */
  thresholdMs: number;
  /** Most recent slow queries, newest-first. */
  recent: SlowQueryRow[];
  /** Top-10 slowest in the last 24h. */
  topSlowest24h: SlowQueryRow[];
  /** Aggregate counts per hour bucket (last 24h, oldest first). */
  hourlyBuckets: number[];
  /** Total slow queries in the last 24h. */
  total24h: number;
}

export async function getPerfOverview(): Promise<PerfOverview> {
  const since = new Date(Date.now() - 24 * 3600_000);
  const [recent, topSlowest24h, last24h] = await Promise.all([
    prisma.slowQueryLog.findMany({ orderBy: { occurredAt: "desc" }, take: 50 }),
    prisma.slowQueryLog.findMany({
      where: { occurredAt: { gte: since } },
      orderBy: { durationMs: "desc" },
      take: 10,
    }),
    prisma.slowQueryLog.findMany({
      where: { occurredAt: { gte: since } },
      select: { occurredAt: true },
    }),
  ]);

  const hourlyBuckets = Array.from({ length: 24 }, () => 0);
  const nowMs = Date.now();
  for (const r of last24h) {
    const ageMs = nowMs - r.occurredAt.getTime();
    const idx = 23 - Math.floor(ageMs / 3600_000);
    if (idx >= 0 && idx < 24) hourlyBuckets[idx]++;
  }

  const map = (r: typeof recent[number]): SlowQueryRow => ({
    id: r.id,
    occurredAt: r.occurredAt.toISOString(),
    query: r.query,
    params: r.params,
    durationMs: r.durationMs,
    endpoint: r.endpoint,
  });

  return {
    thresholdMs: parseInt(process.env.SLOW_QUERY_MS ?? "500", 10),
    recent: recent.map(map),
    topSlowest24h: topSlowest24h.map(map),
    hourlyBuckets,
    total24h: last24h.length,
  };
}

// ─── Booking detail (for /bookings/[id]) ───────────────────────────────

export interface BookingDetailRow extends BookingRow {
  /** Aggregated payment history derived from BookingEvents tagged payment_*. */
  paymentHistory: Array<{ at: string; type: "captured" | "failed" | "refunded"; body: string | null }>;
  /** Audit log: every BookingEvent for this booking, oldest first. */
  auditLog: Array<{ id: string; type: string; at: string; body: string | null }>;
  /** Number of messages in the matching thread (for the "Open thread" affordance). */
  threadMessageCount: number;
  /** Hotel timezone (for clock formatting in the UI). */
  hotelTimezone: string;
}

export async function getBookingDetail(bookingId: string): Promise<BookingDetailRow | null> {
  const hotelId = await currentHotelId();
  // Reuse mapBookings for the heavy lifting — same shape as the list page.
  const raw = await prisma.booking.findFirst({
    where: { id: bookingId, hotelId },
    include: {
      guest: true,
      channel: true,
      roomType: true,
      room: true,
      requests: true,
      events: { orderBy: { occurredAt: "asc" } },
    },
  });
  if (!raw) return null;
  const [base] = await mapBookings([raw]);
  if (!base) return null;

  const hotel = await prisma.hotel.findUniqueOrThrow({ where: { id: hotelId }, select: { timezone: true } });
  const threadMessageCount = base.threadId
    ? await prisma.message.count({ where: { threadId: base.threadId } })
    : 0;

  const paymentHistory = raw.events
    .filter((e) => e.type === "payment_captured" || e.type === "payment_failed" || e.type === "payment_refunded")
    .map((e) => ({
      at: e.occurredAt.toISOString(),
      type: (e.type === "payment_captured" ? "captured" : e.type === "payment_failed" ? "failed" : "refunded") as "captured" | "failed" | "refunded",
      body: e.body,
    }));

  return {
    ...base,
    paymentHistory,
    auditLog: raw.events.map((e) => ({ id: e.id, type: e.type, at: e.occurredAt.toISOString(), body: e.body })),
    threadMessageCount,
    hotelTimezone: hotel.timezone,
  };
}

// ─── Saved filters (for sidebar quick-access) ──────────────────────────

export type SavedFilterScopeStr = "bookings" | "messages";

export interface SavedFilterRow {
  id: string;
  scope: SavedFilterScopeStr;
  label: string;
  icon: string | null;
  /** Params get serialized into URL search params on click. Always a string map. */
  params: Record<string, string>;
  sortIndex: number;
  hitCount: number;
}

export async function getSavedFilters(scope?: SavedFilterScopeStr): Promise<SavedFilterRow[]> {
  const hotelId = await currentHotelId();
  const rows = await prisma.savedFilter.findMany({
    where: { hotelId, ...(scope ? { scope } : {}) },
    orderBy: [{ sortIndex: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    scope: r.scope,
    label: r.label,
    icon: r.icon,
    // Coerce params back to a string-only map — incoming Json from prisma is `unknown`.
    params: Object.fromEntries(
      Object.entries((r.params ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")]),
    ),
    sortIndex: r.sortIndex,
    hitCount: r.hitCount,
  }));
}

// ─── Outbound integrations (for /settings/integrations) ───────────────

export type IntegrationEventStr = "booking_created" | "booking_cancelled" | "payment_failed" | "warning_digest";
export type IntegrationProviderStr = "slack" | "discord";

export interface OutboundIntegrationRow {
  id: string;
  provider: IntegrationProviderStr;
  label: string;
  /** Truncated for display — full URL is never returned to the client. */
  webhookHostMasked: string;
  events: IntegrationEventStr[];
  enabled: boolean;
  successCount: number;
  failureCount: number;
  lastFiredAt: string | null;
  createdAt: string;
}

export async function getOutboundIntegrations(): Promise<OutboundIntegrationRow[]> {
  const hotelId = await currentHotelId();
  const rows = await prisma.outboundIntegration.findMany({
    where: { hotelId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => {
    let host = "";
    try { host = new URL(r.webhookUrl).host; } catch { host = "(invalid)"; }
    return {
      id: r.id,
      provider: r.provider,
      label: r.label,
      webhookHostMasked: host,
      events: r.events,
      enabled: r.enabled,
      successCount: r.successCount,
      failureCount: r.failureCount,
      lastFiredAt: r.lastFiredAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

// ─── Tax / accounting export ───────────────────────────────────────────

export interface TaxReport {
  hotel: { id: string; name: string; currency: string; logoUrl: string | null };
  /** YYYY-MM */
  ym: string;
  /** Inclusive range, ISO date strings. */
  rangeStart: string;
  rangeEnd: string;
  /** All non-cancelled bookings whose checkOut falls in the month. */
  bookings: Array<{
    id: string;
    externalRef: string | null;
    guestName: string;
    guestCountry: string | null;
    channel: ChannelId;
    roomType: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    total: number;
    /** Estimated commission deducted (KRW). */
    commission: number;
    /** Net to hotel after commission. */
    net: number;
  }>;
  totals: {
    bookings: number;
    nights: number;
    gross: number;
    commission: number;
    net: number;
    /** Per-channel breakdown. */
    byChannel: Array<{ channel: ChannelId; gross: number; commission: number; net: number; bookings: number }>;
  };
  generatedAt: string;
}

/**
 * Build a per-month tax report. The window is closed by check-out date —
 * a 3-night stay starting July 30 lands in August's report. This matches
 * accrual-style accounting which is how most KR hotels file VAT.
 */
export async function buildTaxReport(yearMonth: string): Promise<TaxReport | null> {
  // Validate YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return null;
  const hotelId = await currentHotelId();
  const [year, month] = yearMonth.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1)); // exclusive

  const [hotel, bookings] = await Promise.all([
    prisma.hotel.findUniqueOrThrow({ where: { id: hotelId }, select: { id: true, name: true, currency: true, logoUrl: true } }),
    prisma.booking.findMany({
      where: {
        hotelId,
        status: { not: "cancelled" },
        checkOut: { gte: start, lt: end },
      },
      include: {
        channel: { select: { type: true } },
        roomType: { select: { name: true } },
        guest: { select: { name: true, country: true } },
      },
      orderBy: { checkOut: "asc" },
    }),
  ]);

  const rows = bookings.map((b) => {
    const nights = Math.max(1, Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / 86_400_000));
    const channelType = b.channel?.type ?? "direct";
    const ch = asChannelId(channelType);
    const rate = COMMISSION_RATE[channelType as ChannelType] ?? 0;
    const commission = Math.round(b.total * rate);
    return {
      id: b.id,
      externalRef: b.externalRef,
      guestName: b.guest.name,
      guestCountry: b.guest.country,
      channel: ch,
      roomType: b.roomType.name,
      checkIn: isoDate(b.checkIn),
      checkOut: isoDate(b.checkOut),
      nights,
      total: b.total,
      commission,
      net: b.total - commission,
    };
  });

  const byChannelMap = new Map<ChannelId, { gross: number; commission: number; net: number; bookings: number }>();
  for (const r of rows) {
    const cur = byChannelMap.get(r.channel) ?? { gross: 0, commission: 0, net: 0, bookings: 0 };
    cur.gross += r.total;
    cur.commission += r.commission;
    cur.net += r.net;
    cur.bookings += 1;
    byChannelMap.set(r.channel, cur);
  }
  const byChannel = Array.from(byChannelMap.entries())
    .map(([channel, v]) => ({ channel, ...v }))
    .sort((a, b) => b.gross - a.gross);

  return {
    hotel,
    ym: yearMonth,
    rangeStart: isoDate(start),
    rangeEnd: isoDate(new Date(end.getTime() - 86_400_000)),
    bookings: rows,
    totals: {
      bookings: rows.length,
      nights: rows.reduce((s, r) => s + r.nights, 0),
      gross: rows.reduce((s, r) => s + r.total, 0),
      commission: rows.reduce((s, r) => s + r.commission, 0),
      net: rows.reduce((s, r) => s + r.net, 0),
      byChannel,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ─── Onboarding (for /onboarding) ──────────────────────────────────────

export interface OnboardingStatus {
  completedAt: string | null;
  hotelName: string;
  /** Whether the user already has at least one room type. */
  hasRoomTypes: boolean;
  /** Whether at least one channel is configured. */
  hasChannels: boolean;
  /** Computed step the user should land on. */
  step: "info" | "rooms" | "channels" | "done";
}

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const hotelId = await currentHotelId();
  const [hotel, rtCount, chCount] = await Promise.all([
    prisma.hotel.findUniqueOrThrow({ where: { id: hotelId }, select: { name: true, onboardingCompletedAt: true } }),
    prisma.roomType.count({ where: { hotelId } }),
    prisma.channel.count({ where: { hotelId } }),
  ]);
  const hasRoomTypes = rtCount > 0;
  const hasChannels = chCount > 0;
  const step: OnboardingStatus["step"] =
    hotel.onboardingCompletedAt ? "done"
    : !hasRoomTypes ? "rooms"
    : !hasChannels ? "channels"
    : "info";
  return {
    completedAt: hotel.onboardingCompletedAt?.toISOString() ?? null,
    hotelName: hotel.name,
    hasRoomTypes,
    hasChannels,
    step,
  };
}

// ─── Hotel info (for /settings) ────────────────────────────────────────────

export interface HotelInfo {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  logoUrl: string | null;
  /** Counts to give context on the settings page. */
  stats: { rooms: number; channels: number; guests: number; bookings: number };
}

export async function getHotelInfo(): Promise<HotelInfo> {
  const hotelId = await currentHotelId();
  const [hotel, rooms, channels, guests, bookings] = await Promise.all([
    prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } }),
    prisma.room.count({ where: { roomType: { hotelId } } }),
    prisma.channel.count({ where: { hotelId } }),
    prisma.guest.count({ where: { hotelId } }),
    prisma.booking.count({ where: { hotelId } }),
  ]);
  return {
    id: hotel.id,
    name: hotel.name,
    timezone: hotel.timezone,
    currency: hotel.currency,
    logoUrl: hotel.logoUrl,
    stats: { rooms, channels, guests, bookings },
  };
}

export interface RoomTypeOption {
  id: string;
  name: string;
  capacity: number;
  baseRate: number;
}

export async function getRoomTypeOptions(): Promise<RoomTypeOption[]> {
  const hotelId = await currentHotelId();
  const rows = await prisma.roomType.findMany({
    where: { hotelId },
    select: { id: true, name: true, capacity: true, baseRate: true },
    orderBy: { baseRate: "asc" },
  });
  return rows;
}

// ─── Rooms ────────────────────────────────────────────────────────────────

export interface RoomPhoto {
  id: string;
  url: string;
  filename: string;
  sortIndex: number;
}

export interface RoomTypeWithRates {
  id: string;
  name: string;
  capacity: number;
  baseRate: number;
  bedType: string | null;
  sizeSqm: number | null;
  amenities: string[];
  count: number;
  channelRates: { channel: ChannelId; rate: number }[];
  channelIds: ChannelId[];
  photos: RoomPhoto[];
}

export async function getRoomTypesWithRates(): Promise<RoomTypeWithRates[]> {
  const hotelId = await currentHotelId();
  const today = startOfTodayUtc();
  const tomorrow = addDays(today, 1);
  const channelOrder: ChannelId[] = ["airbnb", "booking", "agoda", "trip", "direct"];

  const [roomTypes, rates, photos] = await Promise.all([
    prisma.roomType.findMany({
      where: { hotelId },
      include: { _count: { select: { rooms: true } } },
      orderBy: { baseRate: "asc" },
    }),
    prisma.rate.findMany({
      where: { roomType: { hotelId }, date: { gte: today, lt: tomorrow }, ratePlan: { name: "Standard" } },
      include: { channel: { select: { type: true } } },
    }),
    prisma.uploadedFile.findMany({
      where: { hotelId, kind: "room_photo" },
      orderBy: [{ sortIndex: "asc" }, { createdAt: "asc" }],
      select: { id: true, url: true, filename: true, sortIndex: true, ownerRefId: true },
    }),
  ]);

  const ratesByRtAndChannel = new Map<string, number>();
  for (const r of rates) {
    if (!r.channel) continue;
    const ch = asChannelId(r.channel.type);
    if (!channelOrder.includes(ch)) continue;
    ratesByRtAndChannel.set(`${r.roomTypeId}:${ch}`, r.amount);
  }
  // Group photos by roomTypeId (= ownerRefId)
  const photosByRt = new Map<string, RoomPhoto[]>();
  for (const p of photos) {
    if (!p.ownerRefId) continue;
    const list = photosByRt.get(p.ownerRefId) ?? [];
    list.push({ id: p.id, url: p.url, filename: p.filename, sortIndex: p.sortIndex });
    photosByRt.set(p.ownerRefId, list);
  }

  return roomTypes.map((rt) => ({
    id: rt.id,
    name: rt.name,
    capacity: rt.capacity,
    baseRate: rt.baseRate,
    bedType: rt.bedType,
    sizeSqm: rt.sizeSqm,
    amenities: rt.amenities,
    count: rt._count.rooms,
    channelRates: channelOrder
      .filter((c) => ratesByRtAndChannel.has(`${rt.id}:${c}`))
      .map((c) => ({ channel: c, rate: ratesByRtAndChannel.get(`${rt.id}:${c}`)! })),
    channelIds: channelOrder.filter((c) => ratesByRtAndChannel.has(`${rt.id}:${c}`)),
    photos: photosByRt.get(rt.id) ?? [],
  }));
}

/**
 * Resolve a `RevenueRange` into a window start date and the number of monthly
 * (or daily-collapsed-into-monthly) buckets to render. For 7d/30d we still
 * bucket by month because the chart is monthly — single bucket for those
 * cases unless they cross month boundaries.
 */
function rangeWindow(range: RevenueRange, today: Date): { windowStart: Date; bucketStarts: Date[] } {
  if (range === "7d") {
    const ws = addDays(today, -6);
    return { windowStart: ws, bucketStarts: monthStartsBetween(ws, today) };
  }
  if (range === "30d") {
    const ws = addDays(today, -29);
    return { windowStart: ws, bucketStarts: monthStartsBetween(ws, today) };
  }
  if (range === "YTD") {
    const ws = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    return { windowStart: ws, bucketStarts: monthStartsBetween(ws, today) };
  }
  // 6M (default)
  const ws = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5, 1));
  return { windowStart: ws, bucketStarts: monthStartsBetween(ws, today) };
}

function monthStartsBetween(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  let cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cur <= last) {
    out.push(cur);
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  return out;
}

export async function getRevenueData(range: RevenueRange = "6M"): Promise<RevenueData> {
  const hotelId = await currentHotelId();
  const today = startOfTodayUtc();
  const { windowStart, bucketStarts } = rangeWindow(range, today);

  const bookings = await prisma.booking.findMany({
    where: {
      hotelId,
      status: { not: "cancelled" },
      checkIn: { gte: windowStart },
    },
    include: { channel: { select: { type: true } }, guest: { select: { country: true } } },
  });

  // monthly bucket × channel — only buckets within the window are pre-seeded.
  const buckets = new Map<string, MonthlyRevenue>();
  for (const d of bucketStarts) {
    buckets.set(ymKey(d), { ym: ymKey(d), byChannel: {}, total: 0 });
  }

  // Daily ranges (7d/30d) need a sub-window filter so we don't include earlier
  // days from the same month.
  const inWindow = (d: Date) => d >= windowStart;
  for (const b of bookings) {
    if (!inWindow(b.checkIn)) continue;
    const ym = ymKey(b.checkIn);
    const bucket = buckets.get(ym);
    if (!bucket) continue;
    const ch = asChannelId(b.channel?.type);
    bucket.byChannel[ch] = (bucket.byChannel[ch] ?? 0) + b.total;
    bucket.total += b.total;
  }

  const monthly = Array.from(buckets.values());

  // profitability totals — same window as the selected range
  const recent = bookings.filter((b) => b.checkIn >= windowStart);
  const byChannelTotals = new Map<ChannelId, number>();
  for (const b of recent) {
    const ch = asChannelId(b.channel?.type);
    byChannelTotals.set(ch, (byChannelTotals.get(ch) ?? 0) + b.total);
  }
  const profitability: ProfitabilityRow[] = Array.from(byChannelTotals.entries())
    .map(([channel, revenue]) => {
      const channelType = (channel as unknown) as ChannelType;
      const feeRate = COMMISSION_RATE[channelType] ?? 0;
      const fee = Math.round(revenue * feeRate * 100) / 100;
      const net = Math.round((revenue - fee) * 100) / 100;
      const margin = revenue === 0 ? 100 : Math.round((net / revenue) * 100);
      return { channel, revenue, fee, net, margin };
    })
    .sort((a, b) => b.revenue - a.revenue);

  // country breakdown for the selected window
  const byCountry = new Map<string, { bookings: number; revenue: number }>();
  for (const b of recent) {
    const code = b.guest.country ?? "??";
    const cur = byCountry.get(code) ?? { bookings: 0, revenue: 0 };
    cur.bookings += 1;
    cur.revenue += b.total;
    byCountry.set(code, cur);
  }
  const totalCountryBookings = Array.from(byCountry.values()).reduce((s, c) => s + c.bookings, 0) || 1;
  const countries: CountryRow[] = Array.from(byCountry.entries())
    .map(([code, c]) => ({
      code,
      name: COUNTRY_NAMES[code] ?? { ko: code, en: code },
      flag: COUNTRY_FLAGS[code] ?? "🏳️",
      bookings: c.bookings,
      pct: Math.round((c.bookings / totalCountryBookings) * 100),
      revenue: c.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  // KPI window: span of the selected range, not just current month
  const windowDays = Math.max(1, Math.round((today.getTime() - windowStart.getTime()) / 86_400_000) + 1);
  const totalRoomNights = recent.reduce((s, b) => {
    const nights = Math.max(1, Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / 86_400_000));
    return s + nights;
  }, 0) || 1;
  const totalRoomCount = await prisma.room.count({ where: { roomType: { hotelId } } });
  const totalAll = monthly.reduce((s, m) => s + m.total, 0);
  const denom = (totalRoomCount * windowDays) || 1;
  const revpar = Math.round(totalAll / denom);
  const adr = Math.round(totalAll / totalRoomNights);
  const occupancy = Math.min(100, Math.round((totalRoomNights / denom) * 100));

  // 14-day forward-looking daily trend (reuses getOccupancyTrend's per-day math)
  const dailyTrend = await getOccupancyTrend(14);

  return {
    range,
    monthly,
    totalAll,
    profitability,
    countries,
    kpi: { totalRev: totalAll, revpar, adr, occupancy },
    dailyTrend,
  };
}

// ─── Automations dashboard ────────────────────────────────────────────────

export interface AutomationLogRow {
  id: string;
  ranAt: string;
  durationMs: number;
  remindersSent: number;
  noShowsCancelled: number;
  reviewRequestsSent: number;
  warningsDigested: number;
  emailsSent: number;
  /** Activity counts for this tick filtered to the current tenant only. */
  myCounts: { reminders: number; noShows: number; reviews: number; warnings: number };
  errors: string | null;
}

export interface AutomationOverview {
  /** Most recent N ticks, newest first. */
  ticks: AutomationLogRow[];
  /** 24h totals scoped to current tenant. */
  totalsLast24h: { reminders: number; noShows: number; reviews: number; warnings: number };
  /** Last clean run timestamp (no errors), or null if every recent tick errored. */
  lastCleanRunAt: string | null;
  /** Last run timestamp (any), or null if no ticks logged yet. */
  lastRunAt: string | null;
  /** Avg tick duration over the returned window (ms). */
  avgDurationMs: number;
  /** 24-hour hourly buckets of current-tenant total activity, oldest first. */
  hourlyActivity: number[];
}

export interface AutomationTickEvent {
  bookingId: string;
  bookingRef: string | null;
  guestName: string;
  channel: ChannelId;
  /** "checkin-reminder" | "review-request" | "warn-digest:<kind>" | "no-show" */
  tag: string;
  occurredAt: string;
}

export interface AutomationTickDetail {
  tick: AutomationLogRow;
  /** Per-hotel breakdown across ALL hotels (admins might want to see this). */
  byHotel: Record<string, { reminders: number; noShows: number; reviews: number; warnings: number }>;
  /** BookingEvents tagged `auto:*` in a ±5min window around the tick's ranAt,
   *  scoped to the current tenant. Useful as "what actually fired". */
  events: AutomationTickEvent[];
}

export async function getAutomationOverview(limit = 50): Promise<AutomationOverview> {
  const hotelId = await currentHotelId();
  const since = new Date(Date.now() - 24 * 3600_000);
  const rows = await prisma.automationLog.findMany({
    orderBy: { ranAt: "desc" },
    take: limit,
  });

  const totals = { reminders: 0, noShows: 0, reviews: 0, warnings: 0 };
  let lastCleanRunAt: string | null = null;
  let avgSum = 0;

  const ticks: AutomationLogRow[] = rows.map((r) => {
    const byHotel = (r.byHotel ?? {}) as Record<
      string,
      { reminders?: number; noShows?: number; reviews?: number; warnings?: number }
    >;
    const my = byHotel[hotelId] ?? {};
    const myCounts = {
      reminders: my.reminders ?? 0,
      noShows: my.noShows ?? 0,
      reviews: my.reviews ?? 0,
      warnings: my.warnings ?? 0,
    };
    if (r.ranAt >= since) {
      totals.reminders += myCounts.reminders;
      totals.noShows += myCounts.noShows;
      totals.reviews += myCounts.reviews;
      totals.warnings += myCounts.warnings;
    }
    if (!lastCleanRunAt && !r.errors) lastCleanRunAt = r.ranAt.toISOString();
    avgSum += r.durationMs;
    return {
      id: r.id,
      ranAt: r.ranAt.toISOString(),
      durationMs: r.durationMs,
      remindersSent: r.remindersSent,
      noShowsCancelled: r.noShowsCancelled,
      reviewRequestsSent: r.reviewRequestsSent,
      warningsDigested: r.warningsDigested,
      emailsSent: r.emailsSent,
      myCounts,
      errors: r.errors,
    };
  });

  // Hourly activity buckets — last 24h, oldest first
  const hourlyActivity = Array.from({ length: 24 }, () => 0);
  const nowMs = Date.now();
  for (const t of ticks) {
    const ageMs = nowMs - new Date(t.ranAt).getTime();
    if (ageMs < 0 || ageMs >= 24 * 3600_000) continue;
    const hoursAgo = Math.floor(ageMs / 3600_000);
    const bucketIdx = 23 - hoursAgo; // oldest at index 0
    if (bucketIdx >= 0 && bucketIdx < 24) {
      hourlyActivity[bucketIdx] += t.myCounts.reminders + t.myCounts.noShows + t.myCounts.reviews + t.myCounts.warnings;
    }
  }

  return {
    ticks,
    totalsLast24h: totals,
    lastCleanRunAt,
    lastRunAt: ticks[0]?.ranAt ?? null,
    avgDurationMs: ticks.length > 0 ? Math.round(avgSum / ticks.length) : 0,
    hourlyActivity,
  };
}

export async function getAutomationTickDetail(tickId: string): Promise<AutomationTickDetail | null> {
  const hotelId = await currentHotelId();
  const row = await prisma.automationLog.findUnique({ where: { id: tickId } });
  if (!row) return null;

  const byHotel = (row.byHotel ?? {}) as Record<
    string,
    { reminders?: number; noShows?: number; reviews?: number; warnings?: number }
  >;
  const my = byHotel[hotelId] ?? {};
  const tick: AutomationLogRow = {
    id: row.id,
    ranAt: row.ranAt.toISOString(),
    durationMs: row.durationMs,
    remindersSent: row.remindersSent,
    noShowsCancelled: row.noShowsCancelled,
    reviewRequestsSent: row.reviewRequestsSent,
    warningsDigested: row.warningsDigested,
    emailsSent: row.emailsSent,
    myCounts: {
      reminders: my.reminders ?? 0,
      noShows: my.noShows ?? 0,
      reviews: my.reviews ?? 0,
      warnings: my.warnings ?? 0,
    },
    errors: row.errors,
  };

  // Normalize byHotel to fully-populated shape for the UI
  const byHotelNorm: Record<string, { reminders: number; noShows: number; reviews: number; warnings: number }> = {};
  for (const [hid, v] of Object.entries(byHotel)) {
    byHotelNorm[hid] = {
      reminders: v.reminders ?? 0,
      noShows: v.noShows ?? 0,
      reviews: v.reviews ?? 0,
      warnings: v.warnings ?? 0,
    };
  }

  const windowMs = 5 * 60_000;
  const start = new Date(row.ranAt.getTime() - windowMs);
  const end = new Date(row.ranAt.getTime() + windowMs);
  const events = await prisma.bookingEvent.findMany({
    where: {
      occurredAt: { gte: start, lte: end },
      body: { startsWith: "auto:" },
      booking: { hotelId },
    },
    select: {
      occurredAt: true,
      body: true,
      booking: {
        select: {
          id: true, externalRef: true,
          guest: { select: { name: true } },
          channel: { select: { type: true } },
        },
      },
    },
    take: 50,
    orderBy: { occurredAt: "desc" },
  });

  const tickEvents: AutomationTickEvent[] = events.map((e) => ({
    bookingId: e.booking.id,
    bookingRef: e.booking.externalRef,
    guestName: e.booking.guest.name,
    channel: asChannelId(e.booking.channel?.type),
    // Strip "auto:" prefix; keep the rest verbatim (e.g. "checkin-reminder", "warn-digest:payment_failed:2026-05-02")
    tag: (e.body ?? "").replace(/^auto:/, ""),
    occurredAt: e.occurredAt.toISOString(),
  }));

  return { tick, byHotel: byHotelNorm, events: tickEvents };
}
