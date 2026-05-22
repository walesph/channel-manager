"use client";

import { Dashboard } from "@/components/dashboard/Dashboard";
import { useApp } from "@/lib/app-context";
import type {
  ActivityItem,
  AiRecommendationSummary,
  ArrivalRow,
  BookingWarningSummaryItem,
  ChannelMixRow,
  DashboardKpis,
  OccupancyTrendPoint,
  UpcomingEventItem,
} from "@/lib/queries";

export function DashboardClient(props: {
  arrivals: ArrivalRow[];
  recommendations: AiRecommendationSummary;
  occupancyTrend: OccupancyTrendPoint[];
  channelMix: ChannelMixRow[];
  kpis: DashboardKpis;
  issueActivity: ActivityItem[];
  warningSummary: BookingWarningSummaryItem[];
  upcomingEvents: UpcomingEventItem[];
}) {
  const { lang } = useApp();
  return <Dashboard lang={lang} {...props} />;
}
