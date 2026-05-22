import { getAutomationOverview } from "@/lib/queries";
import { AutomationsClient } from "./AutomationsClient";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const overview = await getAutomationOverview(50);
  return <AutomationsClient overview={overview} />;
}
