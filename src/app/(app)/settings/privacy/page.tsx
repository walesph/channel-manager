import { getDeletionQueue } from "@/lib/queries";
import { withTenant } from "@/lib/db";
import { currentHotelId } from "@/lib/tenant";
import { PrivacyClient } from "./PrivacyClient";

export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const queue = await withTenant(await currentHotelId(), () => getDeletionQueue());
  return <PrivacyClient queue={queue} />;
}
