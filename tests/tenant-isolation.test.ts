/**
 * Verifies multi-tenant scoping at the data layer.
 *
 * Strategy: create an ephemeral Hotel B with one of each entity, then for
 * every model that carries a `hotelId` (direct or transitive) confirm that:
 *   - findMany({where: {hotelId: A}}) only returns A-owned rows
 *   - findMany({where: {hotelId: B}}) only returns B-owned rows
 *   - The two result sets are disjoint
 *   - A targeted leak probe (looking up B's booking under A's hotelId) returns null
 *
 * Cleanup runs in afterAll regardless of test outcome.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

let hotelAId: string;
let hotelBId: string;
let bookingBId: string;

beforeAll(async () => {
  const a = await prisma.hotel.findFirst({ orderBy: { createdAt: "asc" } });
  if (!a) throw new Error("no seed hotel — run `npm run db:seed`");
  hotelAId = a.id;

  const b = await prisma.hotel.create({
    data: { name: `__test_isolation_${Date.now()}`, currency: "KRW", timezone: "Asia/Seoul" },
  });
  hotelBId = b.id;

  const roomTypeB = await prisma.roomType.create({
    data: { hotelId: b.id, name: "Test Suite", baseRate: 100000, capacity: 2 },
  });
  const roomB = await prisma.room.create({ data: { roomTypeId: roomTypeB.id, number: "B-101" } });
  const channelB = await prisma.channel.create({
    data: { hotelId: b.id, type: "direct", status: "synced" },
  });
  const guestB = await prisma.guest.create({
    data: { hotelId: b.id, name: "Tenant B Guest", email: "tb@test.local", language: "en" },
  });
  const bookingB = await prisma.booking.create({
    data: {
      hotelId: b.id,
      guestId: guestB.id,
      channelId: channelB.id,
      roomTypeId: roomTypeB.id,
      roomId: roomB.id,
      externalRef: "TBX-001",
      status: "confirmed",
      payment: "paid",
      checkIn: new Date(Date.now() + 86_400_000),
      checkOut: new Date(Date.now() + 3 * 86_400_000),
      total: 200000,
    },
  });
  bookingBId = bookingB.id;
  const threadB = await prisma.thread.create({
    data: { hotelId: b.id, guestId: guestB.id, channelId: channelB.id, lastMessageAt: new Date() },
  });
  await prisma.message.create({
    data: { threadId: threadB.id, sender: "guest", body: "test message", createdAt: new Date() },
  });
  await prisma.bookingEvent.create({
    data: { bookingId: bookingB.id, type: "created", occurredAt: new Date(), body: "test" },
  });
  await prisma.savedReply.create({
    data: { hotelId: b.id, label: "Test Reply", body: "test body" },
  });
  await prisma.middleware.create({
    data: { hotelId: b.id, type: "hostaway", status: "disconnected", propertyId: "test-prop" },
  });
});

afterAll(async () => {
  if (hotelBId) {
    // Wrap in a transaction so cleanup is atomic — prevents a partial state
    // (e.g. booking deleted, guest still present) from leaking into the next
    // test file when run in the same vitest fork.
    await prisma.$transaction([
      prisma.message.deleteMany({ where: { thread: { hotelId: hotelBId } } }),
      prisma.thread.deleteMany({ where: { hotelId: hotelBId } }),
      prisma.bookingEvent.deleteMany({ where: { booking: { hotelId: hotelBId } } }),
      prisma.booking.deleteMany({ where: { hotelId: hotelBId } }),
      prisma.guest.deleteMany({ where: { hotelId: hotelBId } }),
      prisma.room.deleteMany({ where: { roomType: { hotelId: hotelBId } } }),
      prisma.roomType.deleteMany({ where: { hotelId: hotelBId } }),
      prisma.channel.deleteMany({ where: { hotelId: hotelBId } }),
      prisma.savedReply.deleteMany({ where: { hotelId: hotelBId } }),
      prisma.middleware.deleteMany({ where: { hotelId: hotelBId } }),
      prisma.hotel.delete({ where: { id: hotelBId } }),
    ]);
  }
  await prisma.$disconnect();
});

describe("direct-scoped models (hotelId column)", () => {
  const directModels = ["roomType", "channel", "guest", "booking", "thread", "savedReply", "middleware"] as const;

  for (const model of directModels) {
    it(`${model}: rows filtered by hotelId never cross tenants`, async () => {
      // @ts-expect-error — generic dispatch on prisma client
      const aRows: { id: string; hotelId: string }[] = await prisma[model].findMany({ where: { hotelId: hotelAId } });
      // @ts-expect-error
      const bRows: { id: string; hotelId: string }[] = await prisma[model].findMany({ where: { hotelId: hotelBId } });

      expect(aRows.every((r) => r.hotelId === hotelAId)).toBe(true);
      expect(bRows.every((r) => r.hotelId === hotelBId)).toBe(true);

      const aIds = new Set(aRows.map((r) => r.id));
      const bIds = new Set(bRows.map((r) => r.id));
      const overlap = [...aIds].filter((id) => bIds.has(id));
      expect(overlap).toEqual([]);
    });
  }
});

describe("transitively-scoped models (hotelId via parent)", () => {
  it("room → roomType.hotelId", async () => {
    const a = await prisma.room.findMany({ where: { roomType: { hotelId: hotelAId } }, include: { roomType: true } });
    const b = await prisma.room.findMany({ where: { roomType: { hotelId: hotelBId } }, include: { roomType: true } });
    expect(a.every((r) => r.roomType.hotelId === hotelAId)).toBe(true);
    expect(b.every((r) => r.roomType.hotelId === hotelBId)).toBe(true);
  });

  it("message → thread.hotelId", async () => {
    const a = await prisma.message.findMany({ where: { thread: { hotelId: hotelAId } }, include: { thread: true } });
    const b = await prisma.message.findMany({ where: { thread: { hotelId: hotelBId } }, include: { thread: true } });
    expect(a.every((m) => m.thread.hotelId === hotelAId)).toBe(true);
    expect(b.every((m) => m.thread.hotelId === hotelBId)).toBe(true);
  });

  it("bookingEvent → booking.hotelId", async () => {
    const a = await prisma.bookingEvent.findMany({ where: { booking: { hotelId: hotelAId } }, include: { booking: true } });
    const b = await prisma.bookingEvent.findMany({ where: { booking: { hotelId: hotelBId } }, include: { booking: true } });
    expect(a.every((e) => e.booking.hotelId === hotelAId)).toBe(true);
    expect(b.every((e) => e.booking.hotelId === hotelBId)).toBe(true);
  });

  it("channelMap → channel.hotelId", async () => {
    const a = await prisma.channelMap.findMany({ where: { channel: { hotelId: hotelAId } }, include: { channel: true } });
    const b = await prisma.channelMap.findMany({ where: { channel: { hotelId: hotelBId } }, include: { channel: true } });
    expect(a.every((m) => m.channel.hotelId === hotelAId)).toBe(true);
    expect(b.every((m) => m.channel.hotelId === hotelBId)).toBe(true);
  });

  it("syncLog → channel.hotelId", async () => {
    const a = await prisma.syncLog.findMany({
      where: { channel: { hotelId: hotelAId } },
      include: { channel: true },
      take: 200,
    });
    const b = await prisma.syncLog.findMany({
      where: { channel: { hotelId: hotelBId } },
      include: { channel: true },
      take: 200,
    });
    expect(a.every((l) => l.channel.hotelId === hotelAId)).toBe(true);
    expect(b.every((l) => l.channel.hotelId === hotelBId)).toBe(true);
  });
});

describe("cross-leak probe", () => {
  it("Hotel B's booking is not findable under Hotel A's hotelId", async () => {
    const exists = await prisma.booking.findUnique({ where: { id: bookingBId } });
    expect(exists).toBeTruthy();

    const leaked = await prisma.booking.findFirst({
      where: { id: bookingBId, hotelId: hotelAId },
    });
    expect(leaked).toBeNull();
  });
});
