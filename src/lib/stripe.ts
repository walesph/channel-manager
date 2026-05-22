import "server-only";
import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

export const stripeEnabled = !!secretKey;

let cached: Stripe | null = null;

/** Returns a memoized Stripe client. Throws if STRIPE_SECRET_KEY is unset. */
export function getStripe(): Stripe {
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY not configured");
  // Default API version pinned by stripe-node — avoids passing apiVersion which
  // requires importing the literal type.
  if (!cached) cached = new Stripe(secretKey);
  return cached;
}
