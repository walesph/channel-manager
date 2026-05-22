import "server-only";
import { prisma } from "./db";

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
 * Throws if the provided resource hotelId does not match the current tenant.
 * Use inside mutation actions after fetching the resource.
 */
export async function assertHotelOwnership(resourceHotelId: string | null | undefined): Promise<void> {
  const expected = await currentHotelId();
  if (resourceHotelId !== expected) {
    throw new Error(`forbidden: resource belongs to a different hotel`);
  }
}
