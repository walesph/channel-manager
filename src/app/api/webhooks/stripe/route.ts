import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getStripe, stripeEnabled } from "@/lib/stripe";
import { logWebhook } from "@/lib/webhook-log";
import { BookingEventType, BookingStatus, PaymentStatus } from "@prisma/client";

export const runtime = "nodejs";

function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * Stripe webhook router. Maps each event type to a single handler that
 * resolves the affected Booking, transitions its payment field, and writes
 * a BookingEvent for the audit log. The route always logs the inbound hit
 * to WebhookLog (via `finish`) regardless of outcome — replay support lives
 * on /settings/webhooks.
 *
 * Handled events:
 *   - checkout.session.completed     → mark paid (existing one-shot flow)
 *   - payment_intent.succeeded       → mark paid (direct PaymentIntent path)
 *   - payment_intent.payment_failed  → mark failed
 *   - charge.refunded                → mark refunded + cancel booking when full refund
 *
 * Idempotency: each handler short-circuits when the booking is already in
 * the target state, so Stripe retries are safe.
 */

export async function POST(req: Request) {
  const startMs = Date.now();
  const rawBody = await req.text();
  let eventType: string | null = null;
  let status: "ok" | "invalid_signature" | "bad_request" | "handler_error" = "ok";
  let responseBody: string | null = null;

  const finish = (res: NextResponse): NextResponse => {
    void logWebhook({
      provider: "stripe",
      eventType,
      status,
      httpStatus: res.status,
      responseBody,
      headers: req.headers,
      body: rawBody,
      durationMs: Date.now() - startMs,
    });
    return res;
  };

  if (!stripeEnabled) {
    status = "bad_request";
    responseBody = "Stripe not configured";
    return finish(bad(503, responseBody));
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    status = "bad_request";
    responseBody = "STRIPE_WEBHOOK_SECRET not configured";
    return finish(bad(500, responseBody));
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    status = "bad_request";
    responseBody = "missing stripe-signature";
    return finish(bad(400, responseBody));
  }

  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (e) {
    status = "invalid_signature";
    responseBody = `invalid signature: ${e instanceof Error ? e.message : "unknown"}`;
    return finish(bad(401, responseBody));
  }
  eventType = event.type;

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "payment_intent.succeeded":
        return finish(await handlePaymentSucceeded(event));

      case "payment_intent.payment_failed":
        return finish(await handlePaymentFailed(event));

      case "charge.refunded":
        return finish(await handleChargeRefunded(event));

      case "customer.subscription.created":
      case "customer.subscription.updated":
        return finish(await handleSubscriptionUpsert(event));

      case "customer.subscription.deleted":
        return finish(await handleSubscriptionDeleted(event));

      default:
        responseBody = `ignored: ${event.type}`;
        return finish(NextResponse.json({ ok: true, ignored: event.type }));
    }
  } catch (e) {
    status = "handler_error";
    responseBody = `handler: ${e instanceof Error ? e.message : String(e)}`;
    return finish(bad(500, responseBody));
  }
}

// ── handlers ─────────────────────────────────────────────────────────

interface MetadataObj { metadata?: Record<string, string> | null }

function bookingIdFromEvent(obj: unknown): string | null {
  const o = obj as MetadataObj;
  return o.metadata?.bookingId ?? null;
}

async function handlePaymentSucceeded(event: { type: string; data: { object: unknown } }): Promise<NextResponse> {
  // checkout.session: payment_status="paid"; payment_intent: status="succeeded"
  const session = event.data.object as MetadataObj & { payment_status?: string; status?: string };
  const bookingId = bookingIdFromEvent(session);
  if (!bookingId) return bad(400, "missing metadata.bookingId");

  // For checkout sessions also confirm payment_status; for PIs the status
  // field is the source of truth and Stripe only fires `succeeded` when paid.
  if (event.type === "checkout.session.completed" && session.payment_status !== "paid") {
    return NextResponse.json({ ok: true, skipped: `payment_status=${session.payment_status}` });
  }

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return bad(404, "booking not found");
  if (booking.payment === PaymentStatus.paid) {
    return NextResponse.json({ ok: true, alreadyPaid: true });
  }

  await prisma.$transaction([
    prisma.booking.update({ where: { id: booking.id }, data: { payment: PaymentStatus.paid } }),
    prisma.bookingEvent.create({
      data: {
        bookingId: booking.id,
        type: BookingEventType.payment_captured,
        occurredAt: new Date(),
        body: `₩${booking.total.toLocaleString()} via Stripe (${event.type})`,
      },
    }),
  ]);
  safeRevalidate();
  return NextResponse.json({ ok: true, bookingId: booking.id, transition: "paid" });
}

async function handlePaymentFailed(event: { data: { object: unknown } }): Promise<NextResponse> {
  const intent = event.data.object as MetadataObj & { last_payment_error?: { message?: string } };
  const bookingId = bookingIdFromEvent(intent);
  if (!bookingId) return bad(400, "missing metadata.bookingId");

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return bad(404, "booking not found");
  if (booking.payment === PaymentStatus.failed) {
    return NextResponse.json({ ok: true, alreadyFailed: true });
  }

  const reason = intent.last_payment_error?.message ?? "no detail";
  await prisma.$transaction([
    prisma.booking.update({ where: { id: booking.id }, data: { payment: PaymentStatus.failed } }),
    prisma.bookingEvent.create({
      data: {
        bookingId: booking.id,
        type: BookingEventType.payment_failed,
        occurredAt: new Date(),
        body: `Stripe failure: ${reason.slice(0, 200)}`,
      },
    }),
  ]);
  safeRevalidate();
  return NextResponse.json({ ok: true, bookingId: booking.id, transition: "failed" });
}

async function handleChargeRefunded(event: { data: { object: unknown } }): Promise<NextResponse> {
  const charge = event.data.object as MetadataObj & {
    amount?: number;
    amount_refunded?: number;
  };
  const bookingId = bookingIdFromEvent(charge);
  if (!bookingId) return bad(400, "missing metadata.bookingId");

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return bad(404, "booking not found");
  if (booking.payment === PaymentStatus.refunded) {
    return NextResponse.json({ ok: true, alreadyRefunded: true });
  }

  // Full refund? (Stripe amounts are in the smallest currency unit; we treat
  // amount_refunded ≥ amount as full.) Partial refunds keep the booking
  // active but write the event for audit.
  const isFull = (charge.amount_refunded ?? 0) >= (charge.amount ?? 0);
  const ops = [
    prisma.booking.update({
      where: { id: booking.id },
      data: {
        payment: PaymentStatus.refunded,
        ...(isFull && booking.status !== BookingStatus.checked_out
          ? { status: BookingStatus.cancelled }
          : {}),
      },
    }),
    prisma.bookingEvent.create({
      data: {
        bookingId: booking.id,
        type: BookingEventType.payment_refunded,
        occurredAt: new Date(),
        body: isFull
          ? `Full refund (₩${booking.total.toLocaleString()}) via Stripe`
          : `Partial refund: ${charge.amount_refunded}/${charge.amount}`,
      },
    }),
  ];
  await prisma.$transaction(ops);
  safeRevalidate();
  return NextResponse.json({ ok: true, bookingId: booking.id, transition: "refunded", isFull });
}

async function handleSubscriptionUpsert(event: { data: { object: unknown } }): Promise<NextResponse> {
  const sub = event.data.object as MetadataObj & {
    id?: string;
    customer?: string;
    status?: string;
    current_period_end?: number;
    items?: { data?: Array<{ price?: { id?: string } }> };
    cancel_at_period_end?: boolean;
  };
  const hotelId = sub.metadata?.hotelId;
  if (!hotelId) {
    // Try to resolve via customer id when metadata wasn't set on the sub.
    if (!sub.customer) return bad(400, "missing hotelId metadata");
    const hotel = await prisma.hotel.findFirst({ where: { stripeCustomerId: sub.customer } });
    if (!hotel) return bad(404, `no hotel for customer ${sub.customer}`);
    return finalize(hotel.id, sub);
  }
  return finalize(hotelId, sub);

  async function finalize(hotelId: string, sub: { id?: string; status?: string; current_period_end?: number; items?: { data?: Array<{ price?: { id?: string } }> } }): Promise<NextResponse> {
    // Map Stripe status → our enum
    const stripeStatus = sub.status ?? "active";
    const ourStatus =
      stripeStatus === "active" || stripeStatus === "trialing" ? "active"
      : stripeStatus === "past_due" || stripeStatus === "unpaid" ? "past_due"
      : stripeStatus === "canceled" ? "cancelled"
      : "active";

    // Plan inference from price id (best effort — falls back to existing plan).
    const priceId = sub.items?.data?.[0]?.price?.id ?? null;
    const inferredPlan = priceId
      ? priceId === process.env.STRIPE_PRICE_STARTER ? "starter"
      : priceId === process.env.STRIPE_PRICE_PRO ? "pro"
      : priceId === process.env.STRIPE_PRICE_ENTERPRISE ? "enterprise"
      : null
      : null;

    await prisma.hotel.update({
      where: { id: hotelId },
      data: {
        stripeSubscriptionId: sub.id ?? undefined,
        subscriptionStatus: ourStatus,
        plan: inferredPlan ?? undefined,
        currentPeriodEndsAt: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
      },
    });
    safeRevalidate();
    return NextResponse.json({ ok: true, hotelId, status: ourStatus, plan: inferredPlan });
  }
}

async function handleSubscriptionDeleted(event: { data: { object: unknown } }): Promise<NextResponse> {
  const sub = event.data.object as MetadataObj & { id?: string; customer?: string };
  const hotelId = sub.metadata?.hotelId
    ?? (sub.customer ? (await prisma.hotel.findFirst({ where: { stripeCustomerId: sub.customer } }))?.id : null);
  if (!hotelId) return bad(400, "missing hotelId");
  await prisma.hotel.update({
    where: { id: hotelId },
    data: { subscriptionStatus: "cancelled", currentPeriodEndsAt: null },
  });
  safeRevalidate();
  return NextResponse.json({ ok: true, hotelId, status: "cancelled" });
}

function safeRevalidate() {
  try {
    revalidatePath("/bookings");
    revalidatePath("/");
    revalidatePath("/messages");
    revalidatePath("/settings/billing");
    revalidatePath("/settings");
  } catch {
    // outside request scope; ignore
  }
}
