/**
 * Tests for billing.ts subscription helpers.
 * Uses live DB but only reads/updates Hotel rows — no booking churn.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { expireStaleTrials, getSubscriptionState, listPlans, planById } from "../src/lib/billing";

const prisma = new PrismaClient();

let hotelId: string;
let originalState: { plan: typeof prisma.hotel.fields.plan extends never ? never : null | "starter" | "pro" | "enterprise"; status: string; trialEndsAt: Date | null; currentPeriodEndsAt: Date | null };

beforeAll(async () => {
  const h = await prisma.hotel.findFirst({ orderBy: { createdAt: "asc" } });
  if (!h) throw new Error("no seed hotel");
  hotelId = h.id;
  originalState = {
    plan: (h.plan as typeof originalState.plan) ?? null,
    status: h.subscriptionStatus,
    trialEndsAt: h.trialEndsAt,
    currentPeriodEndsAt: h.currentPeriodEndsAt,
  };
});

afterEach(async () => {
  // Restore the seed state so subsequent tests aren't affected.
  await prisma.hotel.update({
    where: { id: hotelId },
    data: {
      plan: originalState.plan,
      subscriptionStatus: originalState.status as "trial" | "active" | "past_due" | "cancelled",
      trialEndsAt: originalState.trialEndsAt,
      currentPeriodEndsAt: originalState.currentPeriodEndsAt,
    },
  });
});

describe("listPlans / planById", () => {
  it("exposes 3 plans with monotonically increasing price", () => {
    const plans = listPlans();
    expect(plans.map((p) => p.id)).toEqual(["starter", "pro", "enterprise"]);
    expect(plans[1].priceKrw).toBeGreaterThan(plans[0].priceKrw);
    expect(plans[2].priceKrw).toBeGreaterThan(plans[1].priceKrw);
  });
  it("planById returns the right plan or undefined", () => {
    expect(planById("pro")?.name).toBe("Pro");
    // @ts-expect-error — wrong id type at runtime test
    expect(planById("nonexistent")).toBeUndefined();
  });
});

describe("getSubscriptionState", () => {
  it("returns trial status when within trial window", async () => {
    await prisma.hotel.update({
      where: { id: hotelId },
      data: {
        plan: null,
        subscriptionStatus: "trial",
        trialEndsAt: new Date(Date.now() + 5 * 86_400_000),
        currentPeriodEndsAt: null,
      },
    });
    const s = await getSubscriptionState(hotelId);
    expect(s.status).toBe("trial");
    expect(s.daysRemaining).toBeGreaterThan(0);
    expect(s.isLocked).toBe(false);
  });

  it("locks when trial has expired", async () => {
    await prisma.hotel.update({
      where: { id: hotelId },
      data: {
        plan: null,
        subscriptionStatus: "trial",
        trialEndsAt: new Date(Date.now() - 86_400_000),
      },
    });
    const s = await getSubscriptionState(hotelId);
    expect(s.daysRemaining).toBeLessThanOrEqual(0);
    expect(s.isLocked).toBe(true);
  });

  it("returns active state for paid subscriptions", async () => {
    await prisma.hotel.update({
      where: { id: hotelId },
      data: {
        plan: "pro",
        subscriptionStatus: "active",
        currentPeriodEndsAt: new Date(Date.now() + 20 * 86_400_000),
      },
    });
    const s = await getSubscriptionState(hotelId);
    expect(s.status).toBe("active");
    expect(s.plan).toBe("pro");
    expect(s.isLocked).toBe(false);
  });

  it("locks past_due hotels", async () => {
    await prisma.hotel.update({
      where: { id: hotelId },
      data: { plan: "starter", subscriptionStatus: "past_due" },
    });
    const s = await getSubscriptionState(hotelId);
    expect(s.isLocked).toBe(true);
  });
});

describe("expireStaleTrials", () => {
  it("flags trials whose end date is in the past", async () => {
    await prisma.hotel.update({
      where: { id: hotelId },
      data: {
        subscriptionStatus: "trial",
        trialEndsAt: new Date(Date.now() - 86_400_000),
      },
    });
    const r = await expireStaleTrials(new Date());
    expect(r.flagged).toBeGreaterThanOrEqual(1);
    const after = await prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    expect(after.subscriptionStatus).toBe("past_due");
  });

  it("leaves future trials alone", async () => {
    await prisma.hotel.update({
      where: { id: hotelId },
      data: {
        subscriptionStatus: "trial",
        trialEndsAt: new Date(Date.now() + 5 * 86_400_000),
      },
    });
    await expireStaleTrials(new Date());
    const after = await prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    expect(after.subscriptionStatus).toBe("trial");
  });
});
