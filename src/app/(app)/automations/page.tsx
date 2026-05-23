import { getAutomationOverview } from "@/lib/queries";
import { withTenant } from "@/lib/db";
import { currentHotelId } from "@/lib/tenant";
import { AutomationsClient } from "./AutomationsClient";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const overview = await withTenant(await currentHotelId(), () => getAutomationOverview(50));
  return <AutomationsClient overview={overview} />;
}
