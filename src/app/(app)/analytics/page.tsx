import { getAnalyticsOverview } from "@/lib/queries";
import { withTenant } from "@/lib/db";
import { currentHotelId } from "@/lib/tenant";
import { AnalyticsClient } from "./AnalyticsClient";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const overview = await withTenant(await currentHotelId(), () => getAnalyticsOverview());
  return <AnalyticsClient overview={overview} />;
}
