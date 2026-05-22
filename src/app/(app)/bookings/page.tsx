import { getBookingsPage, getRoomConflicts, getRoomTypeOptions, type BookingFilter } from "@/lib/queries";
import { BookingsClient } from "./BookingsClient";
import { BookingStatus } from "@prisma/client";
import type { ChannelId } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const ALLOWED_CHANNELS = new Set<ChannelId>(["airbnb", "booking", "agoda", "trip", "direct", "fb"]);
const ALLOWED_STATUSES = new Set<BookingStatus>([
  BookingStatus.confirmed,
  BookingStatus.in_house,
  BookingStatus.checked_out,
  BookingStatus.cancelled,
]);
const PAGE_SIZE = 50;

function parseList<T>(raw: string | undefined, allowed: Set<T>): T[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter((s) => allowed.has(s as T)) as T[];
}

function parseDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;
}

function parsePage(raw: string | undefined): number {
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; channel?: string; status?: string; from?: string; to?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const filter: BookingFilter = {
    q: sp.q?.trim() || undefined,
    channels: parseList<ChannelId>(sp.channel, ALLOWED_CHANNELS),
    statuses: parseList<BookingStatus>(sp.status, ALLOWED_STATUSES),
    startDate: parseDate(sp.from),
    endDate: parseDate(sp.to),
  };
  const page = parsePage(sp.page);
  const [bookingsPage, roomTypeOptions, conflicts] = await Promise.all([
    getBookingsPage(page, PAGE_SIZE, filter),
    getRoomTypeOptions(),
    getRoomConflicts(),
  ]);
  return (
    <BookingsClient
      bookings={bookingsPage.rows}
      roomTypeOptions={roomTypeOptions}
      filter={{
        q: filter.q ?? "",
        channels: filter.channels ?? [],
        statuses: filter.statuses ?? [],
        startDate: filter.startDate ?? "",
        endDate: filter.endDate ?? "",
      }}
      pagination={{
        page: bookingsPage.page,
        pageSize: bookingsPage.pageSize,
        total: bookingsPage.total,
        hasMore: bookingsPage.hasMore,
      }}
      conflicts={conflicts}
    />
  );
}
