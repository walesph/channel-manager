import {
  getBookingWarningSummary,
  getChannelMix,
  getDashboardKpis,
  getOccupancyTrend,
  getRateRecommendations,
  getRecentActivity,
  getTodayArrivals,
  getUpcomingEvents,
} from "@/lib/queries";
import { withTenant } from "@/lib/db";
import { currentHotelId } from "@/lib/tenant";
import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Establish the RLS tenant scope for this request.
  const hotelId = await currentHotelId();
  const [arrivals, recommendations, occupancyTrend, channelMix, kpis, activity, warningSummary] = await withTenant(
    hotelId,
    () =>
      Promise.all([
        getTodayArrivals(),
        getRateRecommendations(14),
        getOccupancyTrend(14),
        getChannelMix(),
        getDashboardKpis(),
        getRecentActivity(20),
        getBookingWarningSummary(4),
      ]),
  );
  // Synchronous: pure in-memory event lookup
  const upcomingEvents = getUpcomingEvents(30);
  // Keep activity for non-warning context (sync logs + guest messages)
  const issueActivity = activity.filter((a) => a.kind === "sync_log" || a.kind === "message").slice(0, 3);
  return (
    <DashboardClient
      arrivals={arrivals}
      recommendations={recommendations}
      occupancyTrend={occupancyTrend}
      channelMix={channelMix}
      kpis={kpis}
      issueActivity={issueActivity}
      warningSummary={warningSummary}
      upcomingEvents={upcomingEvents}
    />
  );
}
