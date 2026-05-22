import { redirect } from "next/navigation";
import { getOnboardingStatus } from "@/lib/queries";
import { OnboardingClient } from "./OnboardingClient";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const status = await getOnboardingStatus();
  // If everything is set + the user already marked done, send them home.
  if (status.completedAt) redirect("/");
  return <OnboardingClient status={status} />;
}
