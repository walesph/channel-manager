import { fetchBillingState, fetchPlans } from "@/lib/actions";
import { BillingClient } from "./BillingClient";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const [state, plans] = await Promise.all([fetchBillingState(), fetchPlans()]);
  return <BillingClient state={state} plans={plans} />;
}
