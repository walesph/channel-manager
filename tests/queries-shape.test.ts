/**
 * Read-only assertions on the shape & invariants of high-level queries.
 *
 * Intentionally lightweight: we exercise the live seed via a fake request
 * scope so `currentHotelId()` resolves to the seed hotel via env fallback.
 * No mutations — safe to run repeatedly without cleanup.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

beforeAll(async () => {
  // Pin currentHotelId() to the seed hotel via the env fallback path so
  // queries.ts works outside a Next.js request scope.
  const hotel = await prisma.hotel.findFirst({ orderBy: { createdAt: "asc" } });
  if (!hotel) throw new Error("no seed hotel — run `npm run db:seed`");
  process.env.STAYBOARD_HOTEL_ID = hotel.id;
});

describe("getBookingWarningSummary", () => {
  it("returns items sorted bad → warn → info, capped at limit, with action metadata when applicable", async () => {
    const { getBookingWarningSummary } = await import("../src/lib/queries");
    const items = await getBookingWarningSummary(10);

    // Sort invariant
    const rank = { bad: 0, warn: 1, info: 2 } as const;
    for (let i = 1; i < items.length; i++) {
      expect(rank[items[i].severity]).toBeGreaterThanOrEqual(rank[items[i - 1].severity]);
    }

    // Cap invariant
    expect(items.length).toBeLessThanOrEqual(10);

    // Each item carries the canonical action metadata for its kind
    for (const w of items) {
      if (w.kind === "payment_failed") {
        expect(w.action).toBe("mark_paid");
        expect(w.severity).toBe("bad");
      }
      if (w.kind === "refund_pending") {
        expect(w.action).toBe("mark_refunded");
        expect(w.severity).toBe("warn");
      }
      if (w.kind === "no_room") {
        expect(w.action).toBeNull();
        expect(w.severity).toBe("warn");
      }
      if (w.kind === "stale_pending") {
        expect(w.action).toBe("send_reminder");
        expect(w.severity).toBe("info");
      }
    }
  });
});

describe("getOccupancyTrend", () => {
  it("returns N points with 0–100 occupancy and non-negative ADR/RevPAR", async () => {
    const { getOccupancyTrend } = await import("../src/lib/queries");
    const points = await getOccupancyTrend(7);
    expect(points.length).toBe(7);
    for (const p of points) {
      expect(p.pct).toBeGreaterThanOrEqual(0);
      expect(p.pct).toBeLessThanOrEqual(100);
      expect(p.adr).toBeGreaterThanOrEqual(0);
      expect(p.revpar).toBeGreaterThanOrEqual(0);
      expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("getRevenueData", () => {
  it("respects the range parameter and totals are internally consistent", async () => {
    const { getRevenueData } = await import("../src/lib/queries");
    const data = await getRevenueData("30d");
    expect(data.range).toBe("30d");
    // totalAll equals the sum of monthly bucket totals
    const monthlySum = data.monthly.reduce((s, m) => s + m.total, 0);
    expect(data.totalAll).toBe(monthlySum);
    // dailyTrend is independent from range — always 14 forward-looking points
    expect(data.dailyTrend.length).toBe(14);
    // KPIs are non-negative
    expect(data.kpi.totalRev).toBeGreaterThanOrEqual(0);
    expect(data.kpi.occupancy).toBeGreaterThanOrEqual(0);
    expect(data.kpi.occupancy).toBeLessThanOrEqual(100);
  });
});
