import { getOutboundIntegrations } from "@/lib/queries";
import { IntegrationsClient } from "./IntegrationsClient";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const items = await getOutboundIntegrations();
  return <IntegrationsClient items={items} />;
}
