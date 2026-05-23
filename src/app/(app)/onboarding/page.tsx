import { redirect } from "next/navigation";
import { getOnboardingStatus } from "@/lib/queries";
import { withTenant } from "@/lib/db";
import { currentHotelId } from "@/lib/tenant";
import { OnboardingClient } from "./OnboardingClient";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const status = await withTenant(await currentHotelId(), () => getOnboardingStatus());
  // If everything is set + the user already marked done, send them home.
  if (status.completedAt) redirect("/");
  return <OnboardingClient status={status} />;
}
