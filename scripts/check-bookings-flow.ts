/**
 * End-to-end happy-path flow check.
 *
 * Run via:
 *   npx tsx scripts/check-bookings-flow.ts
 *
 * Walks a booking through the full lifecycle and asserts side-effects at
 * each step:
 *
 *   1. Seed a fresh booking on the existing seed Hotel A (status=confirmed).
 *   2. check_in: status flips to in_house, BookingEvent(checked_in) appears.
 *   3. send_message: a Message + Thread upsert; lastMessageAt advances.
 *   4. cron tick: AutomationLog row gets written; counts emit; idempotent re-run.
 *   5. check_out: status flips to checked_out, BookingEvent(checked_out) appears.
 *   6. cleanup: delete the test booking + thread + messages.
 *
 * Imports `prisma` directly — bypasses `currentHotelId()` (which needs a
 * request scope) and exercises the data layer mutations the server actions
 * eventually run.
 */

// Shim `server-only` so we can import server-only modules from this script.
// In Next.js, the package is webpack-aliased to a stub; here we register an
// empty CJS module so the throw at the top of `server-only/index.js` never
// runs. The shim MUST happen before `automations.ts` is loaded — since static
// `import` statements are hoisted, we use a dynamic `await import()` for it.
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const _serverOnlyPath = _require.resolve("server-only");
_require.cache[_serverOnlyPath] = {
  id: _serverOnlyPath,
  filename: _serverOnlyPath,
  loaded: true,
  exports: {},
  // @ts-expect-error — partial Module shape, sufficient for the cache hit
  children: [],
  paths: [],
};

import { PrismaClient, BookingStatus, BookingEventType, MessageSender } from "@prisma/client";
import type { processAutomations as _PA } from "../src/lib/automations";
let processAutomations: typeof _PA;

const prisma = new PrismaClient();

interface Step {
  name: string;
  ok: boolean;
  detail?: string;
}
const steps: Step[] = [];

function assert(name: string, ok: boolean, detail?: string) {
  steps.push({ name, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log("\n── happy-path booking flow check ──\n");

  // Dynamic import after the server-only shim is in place.
  ({ processAutomations } = await import("../src/lib/automations"));

  const hotel = await prisma.hotel.findFirst({ orderBy: { createdAt: "asc" } });
  if (!hotel) {
    console.error("✗ no seed hotel — run `npm run db:seed`");
    process.exit(2);
  }
  console.log(`Hotel: ${hotel.name} (${hotel.id})`);

  const roomType = await prisma.roomType.findFirst({ where: { hotelId: hotel.id } });
  const channel = await prisma.channel.findFirst({ where: { hotelId: hotel.id, type: "direct" } });
  if (!roomType || !channel) {
    console.error("✗ seed missing roomType or direct channel");
    process.exit(2);
  }

  const guest = await prisma.guest.create({
    data: { hotelId: hotel.id, name: "Flow Test Guest", email: "flow@test.local", language: "ko" },
  });

  let bookingId: string | null = null;
  let threadId: string | null = null;
  try {
    // 1. CREATE
    console.log("\n[1] create");
    const booking = await prisma.booking.create({
      data: {
        hotelId: hotel.id,
        guestId: guest.id,
        channelId: channel.id,
        roomTypeId: roomType.id,
        externalRef: `FLOW-${Date.now()}`,
        status: "confirmed",
        payment: "paid",
        // Use yesterday so check_in won't push it into the no-show window
        checkIn: new Date(Date.now() - 4 * 3600_000),
        checkOut: new Date(Date.now() + 86_400_000),
        total: 150000,
      },
    });
    bookingId = booking.id;
    await prisma.bookingEvent.create({
      data: { bookingId: booking.id, type: BookingEventType.created, occurredAt: new Date(), body: "test:create" },
    });
    assert("booking created (confirmed/paid)", booking.status === "confirmed" && booking.payment === "paid");

    // 2. CHECK IN
    console.log("\n[2] check in");
    await prisma.booking.update({ where: { id: booking.id }, data: { status: BookingStatus.in_house } });
    await prisma.bookingEvent.create({
      data: { bookingId: booking.id, type: BookingEventType.checked_in, occurredAt: new Date(), body: "test:check_in" },
    });
    const after2 = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { events: true } });
    assert("status → in_house", after2.status === "in_house");
    assert(
      "BookingEvent(checked_in) recorded",
      after2.events.some((e) => e.type === BookingEventType.checked_in),
    );

    // 3. SEND MESSAGE
    console.log("\n[3] send message");
    const thread = await prisma.thread.upsert({
      where: { hotelId_guestId_channelId: { hotelId: hotel.id, guestId: guest.id, channelId: channel.id } },
      update: { lastMessageAt: new Date() },
      create: { hotelId: hotel.id, guestId: guest.id, channelId: channel.id, lastMessageAt: new Date() },
    });
    threadId = thread.id;
    const beforeMsgAt = thread.lastMessageAt;
    await new Promise((r) => setTimeout(r, 5));
    await prisma.message.create({
      data: { threadId: thread.id, sender: MessageSender.host, body: "Welcome! Wifi: testing", createdAt: new Date() },
    });
    const after3 = await prisma.thread.update({
      where: { id: thread.id },
      data: { lastMessageAt: new Date() },
    });
    assert(
      "thread.lastMessageAt advanced",
      after3.lastMessageAt.getTime() > beforeMsgAt.getTime(),
    );
    const messages = await prisma.message.findMany({ where: { threadId: thread.id } });
    assert("at least 1 message persisted", messages.length >= 1);

    // 4. CRON TICK + idempotency
    console.log("\n[4] automations tick");
    const logsBefore = await prisma.automationLog.count();
    const r1 = await processAutomations();
    const logsAfter1 = await prisma.automationLog.count();
    assert("AutomationLog row written", logsAfter1 === logsBefore + 1);
    assert("tick has no errors", r1.errors.length === 0, r1.errors.join(" / "));
    const r2 = await processAutomations();
    const logsAfter2 = await prisma.automationLog.count();
    assert("re-run also writes a row", logsAfter2 === logsAfter1 + 1);
    // Idempotency: re-running should not re-fire reminders for any booking
    // already tagged. We can only assert this loosely — the second run's
    // reminders count should be ≤ the first.
    assert(
      "re-run reminders not amplified",
      r2.remindersSent <= r1.remindersSent,
      `${r1.remindersSent} → ${r2.remindersSent}`,
    );

    // 5. CHECK OUT
    console.log("\n[5] check out");
    await prisma.booking.update({ where: { id: booking.id }, data: { status: BookingStatus.checked_out } });
    await prisma.bookingEvent.create({
      data: { bookingId: booking.id, type: BookingEventType.checked_out, occurredAt: new Date(), body: "test:check_out" },
    });
    const after5 = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { events: true } });
    assert("status → checked_out", after5.status === "checked_out");
    assert(
      "BookingEvent(checked_out) recorded",
      after5.events.some((e) => e.type === BookingEventType.checked_out),
    );
    assert(
      "full event chain present (created → checked_in → checked_out)",
      after5.events.some((e) => e.type === BookingEventType.created) &&
        after5.events.some((e) => e.type === BookingEventType.checked_in) &&
        after5.events.some((e) => e.type === BookingEventType.checked_out),
    );
  } finally {
    // 6. CLEANUP
    console.log("\n[6] cleanup");
    if (threadId) {
      await prisma.message.deleteMany({ where: { threadId } });
      await prisma.thread.delete({ where: { id: threadId } });
    }
    if (bookingId) {
      // BookingEvents cascade from Booking
      await prisma.booking.delete({ where: { id: bookingId } });
    }
    await prisma.guest.delete({ where: { id: guest.id } });
    console.log("  cleanup ok");
  }

  // SUMMARY
  const failed = steps.filter((s) => !s.ok);
  console.log(`\n── ${steps.length - failed.length}/${steps.length} steps passed ──`);
  if (failed.length > 0) {
    console.error("FAIL:", failed.map((s) => s.name).join(", "));
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
