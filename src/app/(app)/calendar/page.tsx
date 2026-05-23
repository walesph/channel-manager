import { getCalendarGrid } from "@/lib/queries";
import { withTenant } from "@/lib/db";
import { currentHotelId } from "@/lib/tenant";
import { CalendarClient } from "./CalendarClient";

export const dynamic = "force-dynamic";

const ALLOWED_RANGES = new Set([7, 14, 30, 90]);
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string }>;
}) {
  const sp = await searchParams;
  const requested = parseInt(sp.range ?? "14", 10);
  const days = ALLOWED_RANGES.has(requested) ? requested : 14;
  const startIso = sp.start && ISO_RE.test(sp.start) ? sp.start : undefined;
  const hotelId = await currentHotelId();
  const grid = await withTenant(hotelId, () => getCalendarGrid(days, startIso));
  return <CalendarClient grid={grid} />;
}
