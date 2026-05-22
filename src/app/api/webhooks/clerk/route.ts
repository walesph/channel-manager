import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { prisma } from "@/lib/db";
import { provisionNewHotel } from "@/lib/provision";
import { logWebhook } from "@/lib/webhook-log";

export const runtime = "nodejs";

interface ClerkUserCreatedEvent {
  type: "user.created";
  data: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email_addresses?: { id: string; email_address: string }[];
    primary_email_address_id?: string | null;
    public_metadata?: Record<string, unknown> | null;
  };
}

interface ClerkOrganizationCreatedEvent {
  type: "organization.created";
  data: {
    id: string;
    name?: string | null;
    slug?: string | null;
    created_by?: string | null;
    public_metadata?: Record<string, unknown> | null;
  };
}

type ClerkEvent =
  | ClerkUserCreatedEvent
  | ClerkOrganizationCreatedEvent
  | { type: string; data: Record<string, unknown> };

function bad(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function primaryEmail(data: ClerkUserCreatedEvent["data"]): string | null {
  const list = data.email_addresses ?? [];
  if (list.length === 0) return null;
  if (data.primary_email_address_id) {
    const found = list.find((e) => e.id === data.primary_email_address_id);
    if (found) return found.email_address;
  }
  return list[0].email_address;
}

async function updateClerkPublicMetadata(userId: string, hotelId: string) {
  const { clerkClient } = await import("@clerk/nextjs/server");
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, { publicMetadata: { hotelId } });
}

async function updateClerkOrgPublicMetadata(orgId: string, hotelId: string) {
  const { clerkClient } = await import("@clerk/nextjs/server");
  const client = await clerkClient();
  await client.organizations.updateOrganizationMetadata(orgId, {
    publicMetadata: { hotelId },
  });
}

export async function POST(req: Request) {
  const startMs = Date.now();
  // Read body up-front so the logger always sees it (req body is single-use).
  const rawBody = await req.text();
  let event: ClerkEvent | null = null;
  let status: "ok" | "invalid_signature" | "bad_request" | "handler_error" = "ok";
  let responseBody: string | null = null;

  const finish = (res: NextResponse): NextResponse => {
    void logWebhook({
      provider: "clerk",
      eventType: event?.type ?? null,
      status,
      httpStatus: res.status,
      responseBody,
      headers: req.headers,
      body: rawBody,
      durationMs: Date.now() - startMs,
    });
    return res;
  };

  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    status = "bad_request";
    responseBody = "CLERK_WEBHOOK_SECRET not configured";
    return finish(bad(500, responseBody));
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    status = "bad_request";
    responseBody = "missing svix-* headers";
    return finish(bad(400, responseBody));
  }

  try {
    const wh = new Webhook(secret);
    event = wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkEvent;
  } catch (e) {
    status = "invalid_signature";
    responseBody = `invalid signature: ${e instanceof Error ? e.message : "unknown"}`;
    return finish(bad(401, responseBody));
  }
  // ── organization.created → provision a hotel for the new org ──────────
  if (event.type === "organization.created") {
    const orgData = (event as ClerkOrganizationCreatedEvent).data;
    if (!orgData.id) {
      status = "bad_request";
      responseBody = "missing org id";
      return finish(bad(400, responseBody));
    }

    // Idempotency: if org already has hotelId, skip
    const orgMeta = (orgData.public_metadata ?? {}) as { hotelId?: string };
    if (orgMeta.hotelId) {
      responseBody = "org hotelId already set";
      return finish(NextResponse.json({ ok: true, skipped: responseBody }));
    }

    const hotelName = orgData.name?.trim() || `Org ${orgData.id.slice(-6)} Hotel`;
    let orgHotelId: string | null = null;
    try {
      const hotel = await provisionNewHotel({ name: hotelName });
      orgHotelId = hotel.id;
      await updateClerkOrgPublicMetadata(orgData.id, hotel.id);
      responseBody = `provisioned hotel ${hotel.id} for org ${orgData.id}`;
      return finish(NextResponse.json({ ok: true, orgId: orgData.id, hotelId: hotel.id, kind: "org" }));
    } catch (e) {
      if (orgHotelId) {
        try { await prisma.hotel.delete({ where: { id: orgHotelId } }); } catch {}
      }
      status = "handler_error";
      responseBody = `org provision failed: ${e instanceof Error ? e.message : String(e)}`;
      return finish(bad(500, responseBody));
    }
  }

  if (event.type !== "user.created") {
    // Ack other event types (Clerk retries on non-2xx)
    responseBody = `ignored: ${event.type}`;
    return finish(NextResponse.json({ ok: true, ignored: event.type }));
  }

  const userData = (event as ClerkUserCreatedEvent).data;
  if (!userData.id) {
    status = "bad_request";
    responseBody = "missing user id";
    return finish(bad(400, responseBody));
  }

  // If user already has hotelId metadata (e.g., re-fired event), don't double-provision
  if (userData.public_metadata && (userData.public_metadata as { hotelId?: string }).hotelId) {
    responseBody = "hotelId already set";
    return finish(NextResponse.json({ ok: true, skipped: responseBody }));
  }

  const email = primaryEmail(userData);
  const givenName = userData.first_name?.trim();
  const hotelName = givenName
    ? `${givenName}'s Hotel`
    : email
      ? `${email.split("@")[0]}'s Hotel`
      : `Hotel ${userData.id.slice(-6)}`;

  let hotelId: string | null = null;
  try {
    const hotel = await provisionNewHotel({ name: hotelName });
    hotelId = hotel.id;
    await updateClerkPublicMetadata(userData.id, hotel.id);
    responseBody = `provisioned hotel ${hotel.id} for user ${userData.id}`;
    return finish(NextResponse.json({ ok: true, userId: userData.id, hotelId: hotel.id }));
  } catch (e) {
    // If Clerk metadata update fails after provisioning, delete the orphan hotel
    // so the next webhook retry can re-provision cleanly.
    if (hotelId) {
      try {
        await prisma.hotel.delete({ where: { id: hotelId } });
      } catch {
        // Cascade should clear children; if delete itself fails, just log.
      }
    }
    status = "handler_error";
    responseBody = `provision failed: ${e instanceof Error ? e.message : String(e)}`;
    return finish(bad(500, responseBody));
  }
}
