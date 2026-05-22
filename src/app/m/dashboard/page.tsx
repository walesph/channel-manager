import { getMobileDashboard } from "@/lib/queries";
import { MobileDashClient } from "./MobileDashClient";

export const dynamic = "force-dynamic";

export default async function MobileDashboardPage() {
  const data = await getMobileDashboard();
  return <MobileDashClient data={data} />;
}
