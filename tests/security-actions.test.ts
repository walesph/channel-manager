/**
 * Regression tests for the server-action tenant-security boundary:
 *
 *   #1 createBooking — a public "use server" action whose arguments are
 *      attacker-controllable. A logged-in user must NOT be able to inject a
 *      booking into another hotel by passing a foreign `hotelId`; a sessionless
 *      server-to-server caller (the OTA webhook) legitimately may.
 *
 *   Mutation ownership guard — setBookingStatus (and the 30 actions like it)
 *      must refuse to mutate a resource that belongs to another tenant, via
 *      assertHotelOwnership.
 *
 * The session is pinned to seed Hotel A via STAYBOARD_HOTEL_ID (the env path
 * currentHotelId() falls back to when Clerk is disabled). Clerk is off in the
 * test env, so hasActiveSession() is naturally false — we spy it to true to
 * exercise the "logged-in user" branch.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient, ChannelType } from "@prisma/client";
import * as tenant from "../src/lib/tenant";

const prisma = new PrismaClient();

let hotelAId: string;
let hotelBId: string;
let roomTypeBId: string;
let bookingBId: string;

beforeAll(async () => {
  const a = await prisma.hotel.findFirst({ orderBy: { createdAt: "asc" } });
  if (!a) throw new Error("no seed hotel — run `npm run db:seed`");
  hotelAId = a.id;
  // Pin the session tenant to Hotel A for currentHotelId()/sessionTenantId().
  process.env.STAYBOARD_HOTEL_ID = a.id;

  // Ephemeral Hotel B (the "victim" tenant) with the pieces createBooking needs.
  const b = await prisma.hotel.create({
    data: { name: `__test_secact_${Date.now()}`, currency: "KRW", timezone: "Asia/Seoul" },
  });
  hotelBId = b.id;
  const rtB = await prisma.roomType.create({
    data: { hotelId: b.id, name: "Sec Suite", baseRate: 100000, capacity: 2 },
  });
  roomTypeBId = rtB.id;
  await prisma.channel.create({ data: { hotelId: b.id, type: ChannelType.direct, status: "synced" } });
  const guestB = await prisma.guest.create({
    data: { hotelId: b.id, name: "Sec Guest B", email: "sec-b@test.local" },
  });
  const bookingB = await prisma.booking.create({
    data: {
      hotelId: b.id,
      guestId: guestB.id,
      roomTypeId: rtB.id,
      externalRef: "SEC-B-001",
      status: "confirmed",
      payment: "pending",
      // Far future — clear of the automations reminder/no-show windows so a
      // concurrent tick never touches it.
      checkIn: new Date(Date.now() + 30 * 86_400_000),
      checkOut: new Date(Date.now() + 33 * 86_400_000),
      total: 200000,
    },
  });
  bookingBId = bookingB.id;
});

afterAll(async () => {
  delete process.env.STAYBOARD_HOTEL_ID;
  if (hotelBId) {
    await prisma.$transaction([
      prisma.bookingEvent.deleteMany({ where: { booking: { hotelId: hotelBId } } }),
      prisma.booking.deleteMany({ where: { hotelId: hotelBId } }),
      prisma.guest.deleteMany({ where: { hotelId: hotelBId } }),
      prisma.channel.deleteMany({ where: { hotelId: hotelBId } }),
      prisma.roomType.deleteMany({ where: { hotelId: hotelBId } }),
      prisma.hotel.delete({ where: { id: hotelBId } }),
    ]);
  }
  await prisma.$disconnect();
});

describe("createBooking tenant guard (#1)", () => {
  it("rejects a foreign hotelId when a session is active (no cross-tenant write)", async () => {
    const spy = vi.spyOn(tenant, "hasActiveSession").mockResolvedValue(true);
    try {
      const { createBooking } = await import("../src/lib/actions");
      const res = await createBooking({
        guestName: "Attacker",
        roomTypeId: roomTypeBId, // Hotel B's room
        channelType: ChannelType.direct,
        checkIn: "2026-09-01",
        checkOut: "2026-09-03",
        hotelId: hotelBId, // attacker targets the victim tenant
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/forbidden/i);
    } finally {
      spy.mockRestore();
    }

    // Nothing was written into Hotel B.
    const leaked = await prisma.booking.findFirst({
      where: { hotelId: hotelBId, guest: { name: "Attacker" } },
    });
    expect(leaked).toBeNull();
  });

  it("honors an explicit hotelId when there is NO session (trusted webhook ingestion)", async () => {
    // hasActiveSession() is naturally false here (Clerk disabled) — no spy.
    const { createBooking } = await import("../src/lib/actions");
    const res = await createBooking({
      guestName: "Webhook Guest",
      roomTypeId: roomTypeBId,
      channelType: ChannelType.direct,
      checkIn: "2026-09-10",
      checkOut: "2026-09-12",
      total: 180000,
      externalRef: "SEC-INGEST-001",
      hotelId: hotelBId,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const created = await prisma.booking.findUnique({ where: { id: res.bookingId } });
      expect(created?.hotelId).toBe(hotelBId);
    }
  });
});

describe("mutation ownership guard", () => {
  it("setBookingStatus refuses to mutate another tenant's booking", async () => {
    // Session pinned to Hotel A; target Hotel B's booking.
    const { setBookingStatus } = await import("../src/lib/actions");
    const res = await setBookingStatus(bookingBId, "cancel");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/forbidden/i);

    // Booking B is untouched.
    const after = await prisma.booking.findUnique({ where: { id: bookingBId } });
    expect(after?.status).toBe("confirmed");
  });
});
