import { getDeletionQueue } from "@/lib/queries";
import { PrivacyClient } from "./PrivacyClient";

export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const queue = await getDeletionQueue();
  return <PrivacyClient queue={queue} />;
}
