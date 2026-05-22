import { getRevenueData, type RevenueRange } from "@/lib/queries";
import { RevenueClient } from "./RevenueClient";

export const dynamic = "force-dynamic";

const RANGES = new Set<RevenueRange>(["7d", "30d", "6M", "YTD"]);

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const range: RevenueRange = RANGES.has(sp.range as RevenueRange) ? (sp.range as RevenueRange) : "6M";
  const data = await getRevenueData(range);
  return <RevenueClient data={data} range={range} />;
}
