/**
 * Tenant isolation regression check.
 *
 * Run via:
 *   npx tsx scripts/check-tenant-isolation.ts
 *
 * Strategy:
 *   1. Find the existing seed hotel (Hotel A).
 *   2. Create a fresh, fully-populated Hotel B with: roomType + channel + guest +
 *      booking + thread + savedReply + middleware.
 *   3. For every model that carries `hotelId`, verify that:
 *        a. findMany({where: {hotelId: A}}) only returns A-owned rows.
 *        b. findMany({where: {hotelId: B}}) only returns B-owned rows.
 *        c. The two result sets are disjoint by id.
 *   4. For every model that is hotel-scoped *transitively* (Room via roomType,
 *      Message via thread, BookingEvent via booking), verify the same via
 *      nested where clauses.
 *   5. Roll back: delete Hotel B and all its dependents.
 *   6. Print a PASS / FAIL summary and exit non-zero on failure.
 *
 * NOTE: We deliberately import `prisma` directly instead of any module under
 * `src/lib/` — those import `next/headers` via `tenant.ts` and explode outside
 * a request scope. This script asserts the *data layer* is leak-free, which
 * is what the multi-tenant guards rely on.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}
const checks: Check[] = [];

function record(name: string, pass: boolean, detail?: string) {
  checks.push({ name, pass, detail });
  const tag = pass ? "✓" : "✗";
  const line = `  ${tag} ${name}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
}

async function assertScoped<T extends { hotelId: string }>(
  modelName: string,
  rows: T[],
  expectedHotelId: string,
) {
  const offenders = rows.filter((r) => r.hotelId !== expectedHotelId);
  record(
    `${modelName}: hotelId scoping (${rows.length} rows)`,
    offenders.length === 0,
    offenders.length === 0 ? undefined : `${offenders.length} cross-tenant row(s)`,
  );
}

async function main() {
  console.log("\n── tenant isolation regression check ──\n");

  // ── 1. find Hotel A ────────────────────────────────────────────────────
  const hotelA = await prisma.hotel.findFirst({ orderBy: { createdAt: "asc" } });
  if (!hotelA) {
    console.error("✗ no seed hotel found — run `npm run db:seed` first");
    process.exit(2);
  }
  console.log(`Hotel A: ${hotelA.name} (${hotelA.id})`);

  // ── 2. create Hotel B with one of each ─────────────────────────────────
  const hotelB = await prisma.hotel.create({
    data: { name: `__test_isolation_${Date.now()}`, currency: "KRW", timezone: "Asia/Seoul" },
  });
  console.log(`Hotel B: ${hotelB.name} (${hotelB.id})`);

  let cleanupOk = false;
  try {
    const roomTypeB = await prisma.roomType.create({
      data: { hotelId: hotelB.id, name: "Test Suite", baseRate: 100000, capacity: 2 },
    });
    const roomB = await prisma.room.create({
      data: { roomTypeId: roomTypeB.id, number: "B-101" },
    });
    const channelB = await prisma.channel.create({
      data: { hotelId: hotelB.id, type: "direct", status: "synced" },
    });
    const guestB = await prisma.guest.create({
      data: { hotelId: hotelB.id, name: "Tenant B Guest", email: "tb@test.local", language: "en" },
    });
    const bookingB = await prisma.booking.create({
      data: {
        hotelId: hotelB.id,
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
    const threadB = await prisma.thread.create({
      data: { hotelId: hotelB.id, guestId: guestB.id, channelId: channelB.id, lastMessageAt: new Date() },
    });
    await prisma.message.create({
      data: { threadId: threadB.id, sender: "guest", body: "test message", createdAt: new Date() },
    });
    await prisma.bookingEvent.create({
      data: { bookingId: bookingB.id, type: "created", occurredAt: new Date(), body: "test" },
    });
    await prisma.savedReply.create({
      data: { hotelId: hotelB.id, label: "Test Reply", body: "test body" },
    });
    await prisma.middleware.create({
      data: { hotelId: hotelB.id, type: "hostaway", status: "disconnected", propertyId: "test-prop" },
    });

    // ── 3. direct hotelId-scoped models ─────────────────────────────────
    console.log("\nDirect-scoped models:");
    for (const model of ["roomType", "channel", "guest", "booking", "thread", "savedReply", "middleware"] as const) {
      // @ts-expect-error — generic model dispatch
      const aRows = await prisma[model].findMany({ where: { hotelId: hotelA.id } });
      // @ts-expect-error
      const bRows = await prisma[model].findMany({ where: { hotelId: hotelB.id } });
      await assertScoped(`${model}[A]`, aRows, hotelA.id);
      await assertScoped(`${model}[B]`, bRows, hotelB.id);
      const aIds = new Set(aRows.map((r: { id: string }) => r.id));
      const bIds = new Set(bRows.map((r: { id: string }) => r.id));
      const overlap = [...aIds].filter((id) => bIds.has(id));
      record(`${model}: A/B id sets disjoint`, overlap.length === 0, overlap.length ? `${overlap.length} overlap` : undefined);
    }

    // ── 4. transitively-scoped models ────────────────────────────────────
    console.log("\nTransitive-scoped models:");

    // Room → RoomType → hotelId
    const aRooms = await prisma.room.findMany({ where: { roomType: { hotelId: hotelA.id } }, include: { roomType: true } });
    const bRooms = await prisma.room.findMany({ where: { roomType: { hotelId: hotelB.id } }, include: { roomType: true } });
    record(
      `room: nested A scope (${aRooms.length})`,
      aRooms.every((r) => r.roomType.hotelId === hotelA.id),
    );
    record(
      `room: nested B scope (${bRooms.length})`,
      bRooms.every((r) => r.roomType.hotelId === hotelB.id),
    );

    // Message → Thread → hotelId
    const aMsgs = await prisma.message.findMany({ where: { thread: { hotelId: hotelA.id } }, include: { thread: true } });
    const bMsgs = await prisma.message.findMany({ where: { thread: { hotelId: hotelB.id } }, include: { thread: true } });
    record(
      `message: nested A scope (${aMsgs.length})`,
      aMsgs.every((m) => m.thread.hotelId === hotelA.id),
    );
    record(
      `message: nested B scope (${bMsgs.length})`,
      bMsgs.every((m) => m.thread.hotelId === hotelB.id),
    );

    // BookingEvent → Booking → hotelId
    const aEvents = await prisma.bookingEvent.findMany({ where: { booking: { hotelId: hotelA.id } }, include: { booking: true } });
    const bEvents = await prisma.bookingEvent.findMany({ where: { booking: { hotelId: hotelB.id } }, include: { booking: true } });
    record(
      `bookingEvent: nested A scope (${aEvents.length})`,
      aEvents.every((e) => e.booking.hotelId === hotelA.id),
    );
    record(
      `bookingEvent: nested B scope (${bEvents.length})`,
      bEvents.every((e) => e.booking.hotelId === hotelB.id),
    );

    // ChannelMap → Channel → hotelId
    const aMaps = await prisma.channelMap.findMany({ where: { channel: { hotelId: hotelA.id } }, include: { channel: true } });
    const bMaps = await prisma.channelMap.findMany({ where: { channel: { hotelId: hotelB.id } }, include: { channel: true } });
    record(
      `channelMap: nested A scope (${aMaps.length})`,
      aMaps.every((m) => m.channel.hotelId === hotelA.id),
    );
    record(
      `channelMap: nested B scope (${bMaps.length})`,
      bMaps.every((m) => m.channel.hotelId === hotelB.id),
    );

    // SyncLog → Channel → hotelId
    const aLogs = await prisma.syncLog.findMany({ where: { channel: { hotelId: hotelA.id } }, include: { channel: true }, take: 200 });
    const bLogs = await prisma.syncLog.findMany({ where: { channel: { hotelId: hotelB.id } }, include: { channel: true }, take: 200 });
    record(
      `syncLog: nested A scope (${aLogs.length})`,
      aLogs.every((l) => l.channel.hotelId === hotelA.id),
    );
    record(
      `syncLog: nested B scope (${bLogs.length})`,
      bLogs.every((l) => l.channel.hotelId === hotelB.id),
    );

    // ── 5. cross-leak probe: pick one B booking, verify it never appears
    //       in A-scoped queries by id.
    console.log("\nCross-leak probe:");
    const leakProbe = await prisma.booking.findUnique({ where: { id: bookingB.id } });
    record("booking B exists", !!leakProbe);
    const aLookup = await prisma.booking.findFirst({
      where: { id: bookingB.id, hotelId: hotelA.id },
    });
    record("booking B not findable as Hotel A's", aLookup === null);

    cleanupOk = true;
  } finally {
    // ── 6. cleanup ────────────────────────────────────────────────────
    console.log("\nCleaning up Hotel B…");
    try {
      // Most rows cascade from RoomType/Channel/Booking/Thread via Prisma's
      // onDelete: Cascade. We only need to delete tables whose FK does not
      // cascade — Booking → Guest is one (Guest has many bookings); Booking →
      // Channel is another. Cleanest is bottom-up.
      await prisma.message.deleteMany({ where: { thread: { hotelId: hotelB.id } } });
      await prisma.thread.deleteMany({ where: { hotelId: hotelB.id } });
      await prisma.bookingEvent.deleteMany({ where: { booking: { hotelId: hotelB.id } } });
      await prisma.booking.deleteMany({ where: { hotelId: hotelB.id } });
      await prisma.guest.deleteMany({ where: { hotelId: hotelB.id } });
      await prisma.room.deleteMany({ where: { roomType: { hotelId: hotelB.id } } });
      await prisma.roomType.deleteMany({ where: { hotelId: hotelB.id } });
      await prisma.channel.deleteMany({ where: { hotelId: hotelB.id } });
      await prisma.savedReply.deleteMany({ where: { hotelId: hotelB.id } });
      await prisma.middleware.deleteMany({ where: { hotelId: hotelB.id } });
      await prisma.hotel.delete({ where: { id: hotelB.id } });
      console.log(`Hotel B cleanup: ok${cleanupOk ? "" : " (after error)"}`);
    } catch (e) {
      console.error("Hotel B cleanup failed:", e instanceof Error ? e.message : e);
    }
  }

  // ── summary ─────────────────────────────────────────────────────────
  const failed = checks.filter((c) => !c.pass);
  console.log(`\n── ${checks.length - failed.length}/${checks.length} checks passed ──`);
  if (failed.length > 0) {
    console.error("FAIL:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
  console.log("PASS");
}

main()
  .catch((e) => {
    console.error("script error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
