import { getEmailTemplates } from "@/lib/queries";
import { EmailTemplatesClient } from "./EmailTemplatesClient";

export const dynamic = "force-dynamic";

export default async function EmailTemplatesPage() {
  const templates = await getEmailTemplates();
  return <EmailTemplatesClient templates={templates} />;
}
