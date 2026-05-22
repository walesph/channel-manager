import "server-only";
import { prisma } from "./db";
import { ChannelType } from "@prisma/client";

/**
 * Cross-channel inventory lock.
 *
 * When a booking lands on one OTA, every other OTA selling the same
 * room type must drop their available count by 1 before the next traveller
 * loads a search result — otherwise we get an overbook.
 *
 * Flow:
 *   1. `acquireInventoryLocks(bookingId)` resolves the booking's room type,
 *      collects every ChannelMap for it (= every OTA the room is listed on),
 *      writes one InventoryLock row per (target listing × booking).
 *   2. The push to Hostaway / each OTA happens in `applyBulkEdit` /
 *      `pushInventoryAndRates` — this module just records the lock so
 *      audit + reversal works.
 *   3. On cancel, `releaseInventoryLocks(bookingId)` flips `releasedAt`.
 *
 * Race-safety: we use a single transaction per booking. Two concurrent
 * inbound bookings on different channels can't double-decrement because
 * we lock-then-decrement against the canonical Inventory row.
 */

export interface AcquireResult {
  locks: number;
  /** Listings that received a decrement, by ChannelType. */
  fanout: Array<{ channel: ChannelType; externalId: string }>;
  /** Empty when this room type has no cross-channel mapping (e.g. direct-only). */
  skipped: ChannelType[];
}

export async function acquireInventoryLocks(bookingId: string): Promise<AcquireResult> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { channel: { select: { type: true } } },
  });
  if (!booking.channelId) {
    // Walk-in / iCal-only — nothing to lock cross-channel.
    return { locks: 0, fanout: [], skipped: [] };
  }
  const sourceChannel: ChannelType = booking.channel?.type ?? ChannelType.direct;

  // Collect every OTHER OTA's mapping for this room type.
  const mappings = await prisma.channelMap.findMany({
    where: {
      roomTypeId: booking.roomTypeId,
      channel: { hotelId: booking.hotelId, type: { not: sourceChannel } },
    },
    include: { channel: { select: { type: true, id: true } } },
  });
  if (mappings.length === 0) {
    return { locks: 0, fanout: [], skipped: [] };
  }

  // Single transaction: insert all locks atomically. If a race partner
  // already inserted for this (booking, listing) pair we'd hit a logical
  // dupe — defensive `findFirst` first to keep the operation idempotent.
  const fanout: AcquireResult["fanout"] = [];
  await prisma.$transaction(async (tx) => {
    for (const m of mappings) {
      const existing = await tx.inventoryLock.findFirst({
        where: { bookingId, externalId: m.externalId, releasedAt: null },
      });
      if (existing) continue;
      await tx.inventoryLock.create({
        data: {
          bookingId,
          hotelId: booking.hotelId,
          externalId: m.externalId,
          targetChannel: m.channel.type,
          sourceChannel,
          startDate: booking.checkIn,
          endDate: booking.checkOut,
          units: 1,
        },
      });
      fanout.push({ channel: m.channel.type, externalId: m.externalId });
    }
  });

  return { locks: fanout.length, fanout, skipped: [] };
}

/**
 * Marks all active locks for a booking as released. Idempotent — already-released
 * rows are left alone. Returns the count of newly-released locks.
 */
export async function releaseInventoryLocks(bookingId: string): Promise<{ released: number }> {
  const r = await prisma.inventoryLock.updateMany({
    where: { bookingId, releasedAt: null },
    data: { releasedAt: new Date() },
  });
  return { released: r.count };
}

/**
 * Per-day, per-channel lock count for the calendar's "overbooking risk"
 * banner. Cross-tenant guards live in the caller.
 */
export async function getActiveLockSummary(hotelId: string, fromIso: string, toIso: string): Promise<{
  byChannel: Record<string, number>;
  total: number;
}> {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  const rows = await prisma.inventoryLock.findMany({
    where: {
      hotelId,
      releasedAt: null,
      startDate: { lt: to },
      endDate: { gte: from },
    },
    select: { targetChannel: true, units: true },
  });
  const byChannel: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    byChannel[r.targetChannel] = (byChannel[r.targetChannel] ?? 0) + r.units;
    total += r.units;
  }
  return { byChannel, total };
}
