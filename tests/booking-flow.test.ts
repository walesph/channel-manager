/**
 * Walks a booking through the full lifecycle and asserts side effects at
 * each step: create → check_in → message → automations tick (×2 for
 * idempotency) → check_out. Uses the existing seed Hotel A. Cleans up the
 * test booking, guest, thread, and messages on completion.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BookingEventType, BookingStatus, MessageSender, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

let hotelId: string;
let roomTypeId: string;
let channelId: string;
let guestId: string;
let bookingId: string;
let threadId: string;

beforeAll(async () => {
  const hotel = await prisma.hotel.findFirst({ orderBy: { createdAt: "asc" } });
  if (!hotel) throw new Error("no seed hotel — run `npm run db:seed`");
  hotelId = hotel.id;

  const rt = await prisma.roomType.findFirst({ where: { hotelId } });
  const ch = await prisma.channel.findFirst({ where: { hotelId, type: "direct" } });
  if (!rt || !ch) throw new Error("seed missing roomType or direct channel");
  roomTypeId = rt.id;
  channelId = ch.id;

  const g = await prisma.guest.create({
    data: { hotelId, name: "Flow Test Guest", email: "flow@test.local", language: "ko" },
  });
  guestId = g.id;
});

afterAll(async () => {
  if (threadId) {
    await prisma.message.deleteMany({ where: { threadId } });
    await prisma.thread.delete({ where: { id: threadId } }).catch(() => undefined);
  }
  if (bookingId) {
    // BookingEvents cascade
    await prisma.booking.delete({ where: { id: bookingId } }).catch(() => undefined);
  }
  if (guestId) {
    await prisma.guest.delete({ where: { id: guestId } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

describe("booking lifecycle", () => {
  it("[1] create — confirmed/paid status persisted with a created event", async () => {
    const b = await prisma.booking.create({
      data: {
        hotelId,
        guestId,
        channelId,
        roomTypeId,
        externalRef: `FLOW-${Date.now()}`,
        status: "confirmed",
        payment: "paid",
        // yesterday — keeps it out of the no-show window the cron uses
        checkIn: new Date(Date.now() - 4 * 3600_000),
        checkOut: new Date(Date.now() + 86_400_000),
        total: 150000,
      },
    });
    bookingId = b.id;
    await prisma.bookingEvent.create({
      data: { bookingId: b.id, type: BookingEventType.created, occurredAt: new Date(), body: "test:create" },
    });
    expect(b.status).toBe("confirmed");
    expect(b.payment).toBe("paid");
  });

  it("[2] check_in — status flips to in_house and event is recorded", async () => {
    await prisma.booking.update({ where: { id: bookingId }, data: { status: BookingStatus.in_house } });
    await prisma.bookingEvent.create({
      data: { bookingId, type: BookingEventType.checked_in, occurredAt: new Date(), body: "test:check_in" },
    });
    const after = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { events: true },
    });
    expect(after.status).toBe("in_house");
    expect(after.events.some((e) => e.type === BookingEventType.checked_in)).toBe(true);
  });

  it("[3] send message — thread upsert, message persisted, lastMessageAt advances", async () => {
    const thread = await prisma.thread.upsert({
      where: { hotelId_guestId_channelId: { hotelId, guestId, channelId } },
      update: { lastMessageAt: new Date() },
      create: { hotelId, guestId, channelId, lastMessageAt: new Date() },
    });
    threadId = thread.id;
    const before = thread.lastMessageAt;
    await new Promise((r) => setTimeout(r, 5));
    await prisma.message.create({
      data: { threadId, sender: MessageSender.host, body: "Welcome! Wifi: testing", createdAt: new Date() },
    });
    const after = await prisma.thread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date() },
    });
    expect(after.lastMessageAt.getTime()).toBeGreaterThan(before.getTime());

    const msgs = await prisma.message.findMany({ where: { threadId } });
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });

  it("[4] automations tick — runs cleanly, persists log, and is idempotent on re-run", async () => {
    const { processAutomations } = await import("../src/lib/automations");
    const before = await prisma.automationLog.count();
    const r1 = await processAutomations();
    const afterFirst = await prisma.automationLog.count();
    expect(afterFirst).toBe(before + 1);
    expect(r1.errors).toEqual([]);
    // emailsSent counter exists (mock mode → still increments per send)
    expect(typeof r1.emailsSent).toBe("number");

    const r2 = await processAutomations();
    const afterSecond = await prisma.automationLog.count();
    expect(afterSecond).toBe(afterFirst + 1);
    // Idempotency lever: re-running should never AMPLIFY reminders for already-tagged bookings.
    expect(r2.remindersSent).toBeLessThanOrEqual(r1.remindersSent);
    // Same idempotency for emails — already-emailed bookings won't be re-emailed.
    expect(r2.emailsSent).toBeLessThanOrEqual(r1.emailsSent);
  });

  it("[5] check_out — status flips, full event chain is present", async () => {
    await prisma.booking.update({ where: { id: bookingId }, data: { status: BookingStatus.checked_out } });
    await prisma.bookingEvent.create({
      data: { bookingId, type: BookingEventType.checked_out, occurredAt: new Date(), body: "test:check_out" },
    });
    const after = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { events: true },
    });
    expect(after.status).toBe("checked_out");
    const types = after.events.map((e) => e.type);
    expect(types).toContain(BookingEventType.created);
    expect(types).toContain(BookingEventType.checked_in);
    expect(types).toContain(BookingEventType.checked_out);
  });
});
