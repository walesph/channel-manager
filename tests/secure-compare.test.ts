/**
 * Unit tests for the constant-time secret comparison used by the cron trigger
 * (CRON_SECRET) and the Booking.com webhook (WEBHOOK_SECRET). Locks in the
 * security fix so a future refactor can't silently revert to `===` or weaken
 * the null handling.
 */

import { describe, it, expect } from "vitest";
import { secureCompare } from "../src/lib/secure-compare";

describe("secureCompare", () => {
  it("returns true for identical strings", () => {
    expect(secureCompare("whsec_abc123XYZ", "whsec_abc123XYZ")).toBe(true);
    expect(secureCompare("", "")).toBe(true);
  });

  it("returns false for different strings of equal length", () => {
    expect(secureCompare("whsec_abc123", "whsec_abc124")).toBe(false);
  });

  it("returns false for strings of different length", () => {
    expect(secureCompare("short", "a-much-longer-secret-value")).toBe(false);
  });

  it("is case- and whitespace-sensitive", () => {
    expect(secureCompare("Secret", "secret")).toBe(false);
    expect(secureCompare("secret ", "secret")).toBe(false);
    expect(secureCompare("\tsecret", "secret")).toBe(false);
  });

  it("returns false when either side is null or undefined", () => {
    expect(secureCompare(null, "x")).toBe(false);
    expect(secureCompare("x", null)).toBe(false);
    expect(secureCompare(undefined, "x")).toBe(false);
    expect(secureCompare("x", undefined)).toBe(false);
    expect(secureCompare(null, null)).toBe(false);
    expect(secureCompare(undefined, undefined)).toBe(false);
  });

  it("does not treat empty string as equal to a real secret", () => {
    expect(secureCompare("", "whsec_real")).toBe(false);
    expect(secureCompare("whsec_real", "")).toBe(false);
  });
});
