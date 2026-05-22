import "server-only";
import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import { prisma } from "./db";

/**
 * Stayboard SaaS subscription helpers.
 *
 * Plan catalog is local config (price IDs come from env per environment).
 * Status is the source of truth for feature gating; trial → active → past_due
 * → cancelled is the canonical lifecycle.
 *
 * Mock mode: when STRIPE_SECRET_KEY is unset, `startCheckout` returns a
 * fake URL and `openPortal` opens a stub modal — keeps the UI testable
 * end-to-end in dev without real Stripe creds.
 */

export interface PlanDef {
  id: SubscriptionPlan;
  name: string;
  /** Monthly price in KRW (display only — Stripe authoritative). */
  priceKrw: number;
  /** Hard limits surfaced in UI to anchor the upsell story. */
  features: { rooms: number | "unlimited"; channels: number | "unlimited"; emails: number | "unlimited" };
  /** Stripe price id, set per environment in env. Empty in dev mock mode. */
  stripePriceId: string;
}

const PLANS: PlanDef[] = [
  {
    id: "starter",
    name: "Starter",
    priceKrw: 49_000,
    features: { rooms: 20, channels: 4, emails: 500 },
    stripePriceId: process.env.STRIPE_PRICE_STARTER ?? "",
  },
  {
    id: "pro",
    name: "Pro",
    priceKrw: 129_000,
    features: { rooms: 100, channels: 8, emails: 5_000 },
    stripePriceId: process.env.STRIPE_PRICE_PRO ?? "",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceKrw: 399_000,
    features: { rooms: "unlimited", channels: "unlimited", emails: "unlimited" },
    stripePriceId: process.env.STRIPE_PRICE_ENTERPRISE ?? "",
  },
];

export function listPlans(): PlanDef[] {
  return PLANS;
}

export function planById(id: SubscriptionPlan): PlanDef | undefined {
  return PLANS.find((p) => p.id === id);
}

export interface SubscriptionState {
  plan: SubscriptionPlan | null;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  /** Days until trial / current period ends. Negative = past. */
  daysRemaining: number | null;
  /** True when feature gating should kick in. */
  isLocked: boolean;
}

export async function getSubscriptionState(hotelId: string): Promise<SubscriptionState> {
  const hotel = await prisma.hotel.findUniqueOrThrow({
    where: { id: hotelId },
    select: { plan: true, subscriptionStatus: true, trialEndsAt: true, currentPeriodEndsAt: true },
  });
  const now = Date.now();
  let daysRemaining: number | null = null;
  let isLocked = false;
  if (hotel.subscriptionStatus === "trial") {
    if (hotel.trialEndsAt) {
      daysRemaining = Math.ceil((hotel.trialEndsAt.getTime() - now) / 86_400_000);
      isLocked = daysRemaining <= 0;
    } else {
      // No trialEndsAt yet → still considered active (just-provisioned)
      daysRemaining = 14;
    }
  } else if (hotel.subscriptionStatus === "active") {
    if (hotel.currentPeriodEndsAt) {
      daysRemaining = Math.ceil((hotel.currentPeriodEndsAt.getTime() - now) / 86_400_000);
    }
  } else if (hotel.subscriptionStatus === "past_due" || hotel.subscriptionStatus === "cancelled") {
    isLocked = true;
  }
  return {
    plan: hotel.plan,
    status: hotel.subscriptionStatus,
    trialEndsAt: hotel.trialEndsAt?.toISOString() ?? null,
    currentPeriodEndsAt: hotel.currentPeriodEndsAt?.toISOString() ?? null,
    daysRemaining,
    isLocked,
  };
}

/**
 * Marks a hotel as past_due when the trial has expired without a paid plan.
 * Called by the cron tick — keeps the gating consistent across requests.
 */
export async function expireStaleTrials(now: Date = new Date()): Promise<{ flagged: number }> {
  const r = await prisma.hotel.updateMany({
    where: {
      subscriptionStatus: "trial",
      trialEndsAt: { lt: now },
    },
    data: { subscriptionStatus: "past_due" },
  });
  return { flagged: r.count };
}
