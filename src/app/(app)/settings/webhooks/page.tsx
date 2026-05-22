import { getWebhookLogs } from "@/lib/queries";
import { WebhooksClient } from "./WebhooksClient";

export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  const logs = await getWebhookLogs(100);
  return <WebhooksClient logs={logs} />;
}
