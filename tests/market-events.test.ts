/**
 * Pure tests for market.ts holiday/event lookup.
 */
import { describe, it, expect } from "vitest";
import { competitorAvgRate, eventFor, eventsInRange } from "../src/lib/market";

describe("eventFor", () => {
  it("returns recurring event for fixed-date holidays", () => {
    const e = eventFor("2026-12-25");
    expect(e?.label).toBe("크리스마스");
    expect(e?.category).toBe("public_holiday");
    expect(e?.multiplier).toBeGreaterThan(1);
  });

  it("returns specific (lunar) event when both recurring and specific exist", () => {
    // 2026-02-17 is Seollal — falls on a date that doesn't have a recurring rule.
    const e = eventFor("2026-02-17");
    expect(e?.label).toBe("설날");
    expect(e?.category).toBe("public_holiday");
  });

  it("returns null for ordinary days", () => {
    expect(eventFor("2026-07-15")).toBeNull();
  });
});

describe("eventsInRange", () => {
  it("walks an inclusive range and collects all events", () => {
    // 2026-07-20 (여름방학 시작) is in the SPECIFIC table; surrounding days
    // have nothing seeded. Confirms inclusive iteration without false positives.
    const items = eventsInRange("2026-07-19", "2026-07-22");
    const dates = items.map((i) => i.date);
    expect(dates).toContain("2026-07-20");
    expect(dates).not.toContain("2026-07-19");
    expect(dates).not.toContain("2026-07-21");
    expect(dates).not.toContain("2026-07-22");
  });

  it("returns empty for invalid input", () => {
    expect(eventsInRange("bad", "2026-01-01")).toEqual([]);
  });
});

describe("competitorAvgRate", () => {
  it("is deterministic — same input → same output", () => {
    const a = competitorAvgRate("rt-1", "2026-05-01", 100_000);
    const b = competitorAvgRate("rt-1", "2026-05-01", 100_000);
    expect(a).toBe(b);
  });

  it("stays within ±20% of base rate", () => {
    const base = 100_000;
    for (const dow of [0, 1, 2, 3, 4, 5, 6]) {
      const r = competitorAvgRate("rt-1", `2026-05-0${dow + 1}`, base);
      expect(r).toBeGreaterThanOrEqual(base * 0.85);
      expect(r).toBeLessThanOrEqual(base * 1.2);
    }
  });

  it("rounds to nearest 1000 KRW", () => {
    const r = competitorAvgRate("rt-1", "2026-05-01", 100_000);
    expect(r % 1000).toBe(0);
  });
});
