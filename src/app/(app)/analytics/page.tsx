import { getAnalyticsOverview } from "@/lib/queries";
import { AnalyticsClient } from "./AnalyticsClient";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const overview = await getAnalyticsOverview();
  return <AnalyticsClient overview={overview} />;
}
