import "server-only";
import { BookingEventType, BookingStatus, MessageSender, type PaymentStatus } from "@prisma/client";
import { prisma } from "./db";
import { sendEmail } from "./email";
import { renderEmailTemplate } from "./email-templates";
import { expireStaleTrials } from "./billing";

export interface AutomationRunResult {
  ranAt: string;
  remindersSent: number;
  noShowsCancelled: number;
  reviewRequestsSent: number;
  /** Bad-severity booking warnings newly flagged this tick (cross-hotel total). */
  warningsDigested: number;
  /** Per-hotel breakdown of warnings flagged this tick. */
  warningsByHotel: Record<string, number>;
  /** Emails actually sent this tick (real + mock). */
  emailsSent: number;
  errors: string[];
}

const CHECKIN_REMINDER_TAG = "checkin-reminder";
const CHECKIN_REMINDER_EMAIL_TAG = "checkin-reminder-email";
const REVIEW_REQUEST_EMAIL_TAG = "review-request-email";
const WARN_DIGEST_TAG = "warn-digest";
const NOSHOW_CUTOFF_HOURS = 22; // hours after scheduled check-in start (15:00) before flagging no-show

/**
 * Replicates `computeBookingWarnings` from queries.ts but for the automation tick.
 * Kept in-file (not imported) because queries.ts pulls in `next/headers` via tenant.ts.
 */
type WarnKind = "payment_failed" | "refund_pending" | "no_room" | "stale_pending";
function detectBadWarnings(b: {
  status: BookingStatus;
  payment: PaymentStatus;
  roomId: string | null;
}): WarnKind[] {
  const out: WarnKind[] = [];
  if (b.payment === "failed") out.push("payment_failed");
  // Severity=bad currently = payment_failed only. Other kinds (refund_pending,
  // no_room, stale_pending) are warn/info — surfaced in dashboard but skipped here.
  return out;
}

/**
 * Idempotent automation tick. Designed to be called from a cron-like trigger
 * (Vercel Cron, GitHub Actions, or POST /api/cron/run). Each side-effect is
 * guarded with a tag/event so re-runs don't double-fire.
 *
 * Tasks:
 *   1. 24h before check-in → post "체크인 안내" SavedReply into the booking's thread
 *   2. Past check-in but still confirmed > 22h → mark cancelled, log no-show
 *   3. After check-out (yesterday) → post "리뷰 요청" if not yet sent
 */
export async function processAutomations(now: Date = new Date()): Promise<AutomationRunResult> {
  const startMs = Date.now();
  const errors: string[] = [];
  const result: AutomationRunResult = {
    ranAt: now.toISOString(),
    remindersSent: 0,
    noShowsCancelled: 0,
    reviewRequestsSent: 0,
    warningsDigested: 0,
    warningsByHotel: {},
    emailsSent: 0,
    errors,
  };
  // byHotel breakdown built up as side effects fire; per-hotel zero-rows are
  // skipped to keep the JSON small.
  const byHotel: Record<string, { reminders: number; noShows: number; reviews: number; warnings: number }> = {};
  const bumpHotel = (hotelId: string, key: "reminders" | "noShows" | "reviews" | "warnings") => {
    const cur = byHotel[hotelId] ?? { reminders: 0, noShows: 0, reviews: 0, warnings: 0 };
    cur[key]++;
    byHotel[hotelId] = cur;
  };

  // ── 1. Check-in reminders (~24h ahead) ────────────────────────────────
  const tomorrow = new Date(now.getTime() + 24 * 3600_000);
  const reminderWindowStart = startOfDayUtc(tomorrow);
  const reminderWindowEnd = addDays(reminderWindowStart, 1);
  try {
    const reminderCandidates = await prisma.booking.findMany({
      where: {
        status: BookingStatus.confirmed,
        checkIn: { gte: reminderWindowStart, lt: reminderWindowEnd },
      },
      select: {
        id: true, hotelId: true, guestId: true, channelId: true, checkIn: true,
        guest: { select: { name: true, email: true } },
        hotel: { select: { name: true } },
      },
    });
    for (const b of reminderCandidates) {
      // Skip if a reminder note has already been logged for this booking
      const already = await prisma.bookingEvent.findFirst({
        where: { bookingId: b.id, type: BookingEventType.message_received, body: { contains: CHECKIN_REMINDER_TAG } },
      });
      if (already) continue;
      const sent = await postSavedReplyToBookingThread(b, "체크인 안내");
      if (sent) {
        await prisma.bookingEvent.create({
          data: { bookingId: b.id, type: BookingEventType.message_received, occurredAt: now, body: `auto:${CHECKIN_REMINDER_TAG}` },
        });
        result.remindersSent++;
        bumpHotel(b.hotelId, "reminders");
      }
      // Email path is independent of thread message: a guest may not have a
      // channel thread (e.g. iCal-only inbound) but still have an email.
      if (b.guest.email) {
        const emailAlready = await prisma.bookingEvent.findFirst({
          where: { bookingId: b.id, type: BookingEventType.message_received, body: { contains: CHECKIN_REMINDER_EMAIL_TAG } },
        });
        if (!emailAlready) {
          const checkInIso = b.checkIn.toISOString().slice(0, 10);
          const tpl = await renderEmailTemplate(b.hotelId, "checkin_reminder", {
            guestName: b.guest.name,
            hotelName: b.hotel.name,
            checkIn: checkInIso,
          });
          if (tpl.disabled) continue;
          const er = await sendEmail({
            to: b.guest.email,
            subject: tpl.subject,
            body: tpl.body,
            tag: `${CHECKIN_REMINDER_EMAIL_TAG}:${b.id}`,
          });
          if (er.ok) {
            try {
              await prisma.bookingEvent.create({
                data: { bookingId: b.id, type: BookingEventType.message_received, occurredAt: now, body: `auto:${CHECKIN_REMINDER_EMAIL_TAG}${er.mock ? ":mock" : ""}` },
              });
              result.emailsSent++;
            } catch (createErr) {
              // Benign race: the booking was deleted between findMany and
              // create (e.g. a parallel test cleanup). Don't surface as error.
              const msg = createErr instanceof Error ? createErr.message : String(createErr);
              if (!msg.includes("Foreign key constraint")) {
                errors.push(`reminder-email: ${msg}`);
              }
            }
          } else {
            errors.push(`reminder-email: ${er.error}`);
          }
        }
      }
    }
  } catch (e) {
    errors.push(`reminder: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 2. No-show detection (past check-in + N hours, still confirmed) ──
  const noShowCutoff = new Date(now.getTime() - NOSHOW_CUTOFF_HOURS * 3600_000);
  try {
    const noShows = await prisma.booking.findMany({
      where: { status: BookingStatus.confirmed, checkIn: { lt: noShowCutoff } },
      select: { id: true, hotelId: true, total: true },
    });
    for (const b of noShows) {
      await prisma.booking.update({
        where: { id: b.id },
        data: { status: BookingStatus.cancelled },
      });
      await prisma.bookingEvent.create({
        data: { bookingId: b.id, type: BookingEventType.cancelled, occurredAt: now, body: "auto: no-show" },
      });
      result.noShowsCancelled++;
      bumpHotel(b.hotelId, "noShows");
    }
  } catch (e) {
    errors.push(`no-show: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 3. Review requests (day after check-out) ─────────────────────────
  const yesterdayStart = addDays(startOfDayUtc(now), -1);
  const yesterdayEnd = startOfDayUtc(now);
  try {
    const reviewCandidates = await prisma.booking.findMany({
      where: {
        status: BookingStatus.checked_out,
        checkOut: { gte: yesterdayStart, lt: yesterdayEnd },
      },
      select: {
        id: true, hotelId: true, guestId: true, channelId: true,
        guest: { select: { name: true, email: true } },
        hotel: { select: { name: true } },
      },
    });
    for (const b of reviewCandidates) {
      const already = await prisma.bookingEvent.findFirst({
        where: {
          bookingId: b.id,
          type: BookingEventType.message_received,
          // Match the thread-message tag specifically; the email tag also
          // contains "review-request" so we'd otherwise short-circuit the email path.
          body: { equals: "auto:review-request" },
        },
      });
      if (!already) {
        const sent = await postSavedReplyToBookingThread(b, "리뷰 요청");
        if (sent) {
          await prisma.bookingEvent.create({
            data: { bookingId: b.id, type: BookingEventType.message_received, occurredAt: now, body: "auto:review-request" },
          });
          result.reviewRequestsSent++;
          bumpHotel(b.hotelId, "reviews");
        }
      }
      if (b.guest.email) {
        const emailAlready = await prisma.bookingEvent.findFirst({
          where: { bookingId: b.id, type: BookingEventType.message_received, body: { contains: REVIEW_REQUEST_EMAIL_TAG } },
        });
        if (!emailAlready) {
          const tpl = await renderEmailTemplate(b.hotelId, "review_request", {
            guestName: b.guest.name,
            hotelName: b.hotel.name,
          });
          if (tpl.disabled) continue;
          const er = await sendEmail({
            to: b.guest.email,
            subject: tpl.subject,
            body: tpl.body,
            tag: `${REVIEW_REQUEST_EMAIL_TAG}:${b.id}`,
          });
          if (er.ok) {
            try {
              await prisma.bookingEvent.create({
                data: { bookingId: b.id, type: BookingEventType.message_received, occurredAt: now, body: `auto:${REVIEW_REQUEST_EMAIL_TAG}${er.mock ? ":mock" : ""}` },
              });
              result.emailsSent++;
            } catch (createErr) {
              const msg = createErr instanceof Error ? createErr.message : String(createErr);
              if (!msg.includes("Foreign key constraint")) {
                errors.push(`review-email: ${msg}`);
              }
            }
          } else {
            errors.push(`review-email: ${er.error}`);
          }
        }
      }
    }
  } catch (e) {
    errors.push(`review: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 4. Daily warning digest (severity=bad only) ──────────────────────
  // Scans recent + upcoming bookings, flags bad-severity warnings exactly once
  // per (booking, kind, day) via a BookingEvent ack tag. Idempotent — re-runs
  // within the same UTC day are no-ops.
  const dayTag = startOfDayUtc(now).toISOString().slice(0, 10); // YYYY-MM-DD
  const cutoff = new Date(now.getTime() - 7 * 86_400_000);
  try {
    const candidates = await prisma.booking.findMany({
      where: { OR: [{ checkIn: { gte: cutoff } }, { status: BookingStatus.in_house }] },
      select: { id: true, hotelId: true, status: true, payment: true, roomId: true },
      take: 1000,
    });
    for (const b of candidates) {
      const kinds = detectBadWarnings(b);
      for (const kind of kinds) {
        const tagBody = `auto:${WARN_DIGEST_TAG}:${kind}:${dayTag}`;
        const already = await prisma.bookingEvent.findFirst({
          where: { bookingId: b.id, type: BookingEventType.message_received, body: tagBody },
        });
        if (already) continue;
        await prisma.bookingEvent.create({
          data: { bookingId: b.id, type: BookingEventType.message_received, occurredAt: now, body: tagBody },
        });
        result.warningsDigested++;
        result.warningsByHotel[b.hotelId] = (result.warningsByHotel[b.hotelId] ?? 0) + 1;
        bumpHotel(b.hotelId, "warnings");
      }
    }
  } catch (e) {
    errors.push(`warning-digest: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 4b. GDPR hard-delete past 30-day grace ─────────────────────────────
  try {
    const cutoff = new Date(now.getTime() - 30 * 86_400_000);
    const stale = await prisma.guest.findMany({
      where: { deletionRequestedAt: { lt: cutoff } },
      select: { id: true },
    });
    for (const g of stale) {
      // Same cascade chain as hardDeleteGuestNow — kept inline so this
      // module doesn't have to import a server action.
      await prisma.$transaction([
        prisma.message.deleteMany({ where: { thread: { guestId: g.id } } }),
        prisma.thread.deleteMany({ where: { guestId: g.id } }),
        prisma.booking.deleteMany({ where: { guestId: g.id } }),
        prisma.guest.delete({ where: { id: g.id } }),
      ]);
    }
    if (stale.length > 0) {
      // Surfaced as a warning so /settings/webhooks can audit it. We don't
      // bump byHotel because GDPR deletion is cross-tenant + already private.
      errors.push(`gdpr-delete: ${stale.length} guest(s) hard-deleted past grace period`);
    }
  } catch (e) {
    errors.push(`gdpr: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 4c. Expire stale trials (subscription gating) ───────────────────
  try {
    const exp = await expireStaleTrials(now);
    if (exp.flagged > 0) {
      errors.push(`billing: ${exp.flagged} hotel(s) trial → past_due`);
    }
  } catch (e) {
    errors.push(`billing: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 5. Persist tick to AutomationLog ─────────────────────────────────
  try {
    await prisma.automationLog.create({
      data: {
        ranAt: now,
        durationMs: Date.now() - startMs,
        remindersSent: result.remindersSent,
        noShowsCancelled: result.noShowsCancelled,
        reviewRequestsSent: result.reviewRequestsSent,
        warningsDigested: result.warningsDigested,
        emailsSent: result.emailsSent,
        byHotel: byHotel as object,
        errors: errors.length > 0 ? errors.join("\n") : null,
      },
    });
  } catch (e) {
    // Don't fail the tick if logging fails — surface in errors only.
    errors.push(`log: ${e instanceof Error ? e.message : String(e)}`);
  }

  return result;
}

async function postSavedReplyToBookingThread(
  booking: { id: string; hotelId: string; guestId: string; channelId: string | null },
  replyLabel: string,
): Promise<boolean> {
  if (!booking.channelId) return false;
  const [thread, savedReply] = await Promise.all([
    prisma.thread.findFirst({
      where: { hotelId: booking.hotelId, guestId: booking.guestId, channelId: booking.channelId },
      select: { id: true },
    }),
    prisma.savedReply.findFirst({
      where: { hotelId: booking.hotelId, label: replyLabel },
      select: { body: true },
    }),
  ]);
  if (!thread || !savedReply) return false;
  const now = new Date();
  await prisma.message.create({
    data: { threadId: thread.id, sender: MessageSender.host, body: savedReply.body, createdAt: now },
  });
  await prisma.thread.update({ where: { id: thread.id }, data: { lastMessageAt: now } });
  return true;
}

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}
