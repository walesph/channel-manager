import { getOutboundIntegrations } from "@/lib/queries";
import { withTenant } from "@/lib/db";
import { currentHotelId } from "@/lib/tenant";
import { IntegrationsClient } from "./IntegrationsClient";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const items = await withTenant(await currentHotelId(), () => getOutboundIntegrations());
  return <IntegrationsClient items={items} />;
}
