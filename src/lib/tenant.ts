import "server-only";
import { prisma } from "./db";
import { tenantHotelStore } from "./tenant-scope";

let cachedFallbackHotelId: string | null = null;

const clerkEnabled =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

/**
 * Returns the active hotel id for the current request.
 *
 * Resolution order:
 *   1. Clerk active organization's publicMetadata.hotelId (org-level, when Clerk is configured)
 *      — supports multi-user hotels via Clerk Organizations.
 *   2. Clerk user-level publicMetadata.hotelId (solo operators without an org)
 *   3. STAYBOARD_HOTEL_ID env var
 *   4. The oldest hotel in the database (dev fallback)
 *
 * The Clerk path is opt-in: set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
 * `CLERK_SECRET_KEY`. For org-based tenancy, create a Clerk Organization and
 * the `organization.created` webhook auto-provisions a hotel and writes the
 * id to org publicMetadata. Solo users can still use user-level metadata.
 */
export async function currentHotelId(): Promise<string> {
  if (clerkEnabled) {
    try {
      const { auth } = await import("@clerk/nextjs/server");
      const { sessionClaims } = await auth();
      // Org first (multi-user hotel)
      const orgClaims = sessionClaims as
        | { o?: { id?: string; rol?: string; slg?: string }; org_metadata?: { hotelId?: string } }
        | null;
      const orgMeta = orgClaims?.org_metadata;
      if (orgMeta?.hotelId) return orgMeta.hotelId;
      // Fall back to user-level
      const userMeta = sessionClaims?.publicMetadata as { hotelId?: string } | undefined;
      if (userMeta?.hotelId) return userMeta.hotelId;
    } catch {
      // Outside a request scope (e.g. test scripts) — fall through to env/db.
    }
  }

  const envId = process.env.STAYBOARD_HOTEL_ID;
  if (envId) return envId;

  if (cachedFallbackHotelId) return cachedFallbackHotelId;
  const hotel = await prisma.hotel.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!hotel) throw new Error("No hotel found. Run `npm run db:seed` first.");
  cachedFallbackHotelId = hotel.id;
  return hotel.id;
}

/**
 * Returns the active Clerk organization id for the current request, if any.
 * Used by /settings/team to fetch org members. Null when Clerk is disabled,
 * outside a request scope, or the user has no active org.
 */
export async function currentClerkOrgId(): Promise<string | null> {
  if (!clerkEnabled) return null;
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const { orgId } = await auth();
    return orgId ?? null;
  } catch {
    return null;
  }
}

/** Whether Clerk is configured at all. Safe to import from server components. */
export function isClerkEnabled(): boolean {
  return clerkEnabled;
}

/**
 * Whether the current request carries an authenticated Clerk session.
 *
 * Used to distinguish a logged-in *user* (whose tenant is fixed to their
 * session) from a sessionless *server-to-server* caller (e.g. an inbound
 * OTA webhook that legitimately specifies which hotel to write to). Returns
 * false when Clerk is disabled or outside a request scope.
 */
export async function hasActiveSession(): Promise<boolean> {
  if (!clerkEnabled) return false;
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    return !!userId;
  } catch {
    return false;
  }
}

/**
 * Resolves the current tenant's hotel id AND enters the RLS scope for the rest
 * of this async execution context (via `tenantHotelStore.enterWith`). After
 * this call, every `scopedPrisma` operation in the same context is bound to
 * this hotel by the row-level-security policies.
 *
 * Use this at the top of session-originated server actions. Reads in server
 * components establish the scope with `withTenant(...)` instead; trusted
 * server-to-server callers (webhooks, cron) never call it, so they stay
 * unscoped (policies permissive).
 */
export async function sessionTenantId(): Promise<string> {
  const id = await currentHotelId();
  tenantHotelStore.enterWith(id);
  return id;
}

/**
 * Enters the RLS scope for an explicit hotel id. Use when the tenant is known
 * but not from the session — e.g. the Booking.com webhook ingesting into the
 * hotel named in its (secret-authenticated) payload.
 */
export function enterTenantScope(hotelId: string): void {
  tenantHotelStore.enterWith(hotelId);
}

/**
 * Throws if the provided resource hotelId does not match the current tenant.
 * Use inside mutation actions after fetching the resource. On success it also
 * enters the RLS scope for this tenant, so subsequent `scopedPrisma` mutations
 * in the action are bound to it.
 */
export async function assertHotelOwnership(resourceHotelId: string | null | undefined): Promise<void> {
  const expected = await currentHotelId();
  if (resourceHotelId !== expected) {
    throw new Error(`forbidden: resource belongs to a different hotel`);
  }
  tenantHotelStore.enterWith(expected);
}
