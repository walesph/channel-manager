/**
 * Proves the Postgres Row-Level Security tenant guard actually enforces
 * isolation when the `app.current_hotel_id` GUC is set (via withTenant()),
 * independent of the application's own where-clauses.
 *
 * Contrast:
 *   - global `prisma` (no tenant context)  → policies permissive, all rows
 *     visible (this is how webhooks/cron/seed run).
 *   - withTenant(hotelX, …)                → an *unscoped* query (no where)
 *     returns ONLY hotelX's rows, and another tenant's row is invisible even
 *     when fetched by primary key.
 *
 * This is the safety net beneath the app's manual hotelId filtering: a query
 * that forgets to scope still cannot leak across tenants.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant, scopedPrisma } from "../src/lib/db";

const prisma = new PrismaClient();

let hotelAId: string;
let hotelBId: string;
let bookingBId: string;

beforeAll(async () => {
  const a = await prisma.hotel.findFirst({ orderBy: { createdAt: "asc" } });
  if (!a) throw new Error("no seed hotel — run `npm run db:seed`");
  hotelAId = a.id;

  // Ephemeral Hotel B with one booking + a transitive child (BookingEvent).
  const b = await prisma.hotel.create({
    data: { name: `__test_rls_${Date.now()}`, currency: "KRW", timezone: "Asia/Seoul" },
  });
  hotelBId = b.id;
  const rtB = await prisma.roomType.create({
    data: { hotelId: b.id, name: "RLS Suite", baseRate: 100000, capacity: 2 },
  });
  const guestB = await prisma.guest.create({
    data: { hotelId: b.id, name: "RLS Guest B", email: "rls-b@test.local" },
  });
  const bookingB = await prisma.booking.create({
    data: {
      hotelId: b.id,
      guestId: guestB.id,
      roomTypeId: rtB.id,
      externalRef: "RLS-B-001",
      status: "confirmed",
      payment: "paid",
      checkIn: new Date(Date.now() + 86_400_000),
      checkOut: new Date(Date.now() + 3 * 86_400_000),
      total: 200000,
    },
  });
  bookingBId = bookingB.id;
  await prisma.bookingEvent.create({
    data: { bookingId: bookingB.id, type: "created", occurredAt: new Date(), body: "rls" },
  });
});

afterAll(async () => {
  // Cleanup uses the global client (no tenant context → permissive policies).
  if (hotelBId) {
    await prisma.$transaction([
      prisma.bookingEvent.deleteMany({ where: { booking: { hotelId: hotelBId } } }),
      prisma.booking.deleteMany({ where: { hotelId: hotelBId } }),
      prisma.guest.deleteMany({ where: { hotelId: hotelBId } }),
      prisma.roomType.deleteMany({ where: { hotelId: hotelBId } }),
      prisma.hotel.delete({ where: { id: hotelBId } }),
    ]);
  }
  await prisma.$disconnect();
});

describe("baseline: no tenant context is permissive", () => {
  it("global prisma sees Hotel B's booking by id (policies permissive when GUC unset)", async () => {
    const row = await prisma.booking.findUnique({ where: { id: bookingBId } });
    expect(row).toBeTruthy();
    expect(row?.hotelId).toBe(hotelBId);
  });
});

describe("withTenant() enforces isolation on UNSCOPED queries", () => {
  it("an unscoped findMany only returns the bound tenant's bookings", async () => {
    const rows = await withTenant(hotelBId, () => scopedPrisma.booking.findMany({}));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.hotelId === hotelBId)).toBe(true);
    expect(rows.some((r) => r.id === bookingBId)).toBe(true);
  });

  it("bound to Hotel A, Hotel B's bookings are entirely absent from an unscoped query", async () => {
    const rows = await withTenant(hotelAId, () => scopedPrisma.booking.findMany({}));
    expect(rows.every((r) => r.hotelId === hotelAId)).toBe(true);
    expect(rows.some((r) => r.id === bookingBId)).toBe(false);
  });

  it("a foreign tenant's row is invisible even when fetched by primary key", async () => {
    const leaked = await withTenant(hotelAId, () => scopedPrisma.booking.findUnique({ where: { id: bookingBId } }));
    expect(leaked).toBeNull();
  });

  it("concurrent reads in the same scope each get their own connection (Promise.all)", async () => {
    const [bookings, events] = await withTenant(hotelBId, () =>
      Promise.all([
        scopedPrisma.booking.findMany({}),
        scopedPrisma.bookingEvent.findMany({ include: { booking: true } }),
      ]),
    );
    expect(bookings.length).toBeGreaterThan(0);
    expect(events.length).toBeGreaterThan(0);
    expect(bookings.every((r) => r.hotelId === hotelBId)).toBe(true);
    expect(events.every((e) => e.booking.hotelId === hotelBId)).toBe(true);
  });

  it("transitive table (BookingEvent) is restricted to the bound tenant", async () => {
    const evScopedToB = await withTenant(hotelBId, () =>
      scopedPrisma.bookingEvent.findMany({ include: { booking: true } }),
    );
    expect(evScopedToB.length).toBeGreaterThan(0);
    expect(evScopedToB.every((e) => e.booking.hotelId === hotelBId)).toBe(true);

    const evScopedToA = await withTenant(hotelAId, () =>
      scopedPrisma.bookingEvent.findMany({ where: { bookingId: bookingBId } }),
    );
    expect(evScopedToA).toEqual([]);
  });
});
