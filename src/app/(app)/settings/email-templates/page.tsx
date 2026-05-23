import { getEmailTemplates } from "@/lib/queries";
import { withTenant } from "@/lib/db";
import { currentHotelId } from "@/lib/tenant";
import { EmailTemplatesClient } from "./EmailTemplatesClient";

export const dynamic = "force-dynamic";

export default async function EmailTemplatesPage() {
  const templates = await withTenant(await currentHotelId(), () => getEmailTemplates());
  return <EmailTemplatesClient templates={templates} />;
}
