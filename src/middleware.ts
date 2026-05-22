import { type NextRequest, NextResponse } from "next/server";

const clerkEnabled =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

/**
 * Routes that carry their own authentication and never rely on a Clerk
 * session: the auth pages, inbound webhooks (signature / shared-secret
 * verified), the cron trigger (CRON_SECRET), and the token-gated self-check-in
 * kiosk. These must stay reachable even when Clerk is disabled — notably
 * `/api/cron`, which Vercel Cron calls with a Bearer token and no session, so
 * it must NOT be caught by `auth.protect()`.
 */
const PUBLIC_ROUTE_PATTERNS = [
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/api/cron(.*)",
  // Self-check-in kiosk — guest-facing, token-gated. Bypass auth.
  "/k/(.*)",
];

/**
 * Opt-in escape hatch for intentionally running without Clerk in production
 * (e.g. a public demo). Without it, a production deploy that is missing Clerk
 * env vars would expose every authenticated page — so we fail CLOSED instead
 * of silently serving the app to anyone.
 */
const allowNoAuth = process.env.ALLOW_NO_AUTH === "1" || process.env.ALLOW_NO_AUTH === "true";

/** Clerk-free path check for the fail-closed branch (avoids importing Clerk). */
function isIndependentlySecuredPath(pathname: string): boolean {
  return (
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/k/")
  );
}

let cachedClerkMiddleware:
  | ((req: NextRequest, ev: unknown) => Response | Promise<Response>)
  | null = null;

export default async function middleware(req: NextRequest, ev: unknown) {
  if (!clerkEnabled) {
    // Dev or explicit opt-in: open, for local/demo convenience.
    if (process.env.NODE_ENV !== "production" || allowNoAuth) {
      return NextResponse.next();
    }
    // Production without Clerk and without opt-in: fail closed. Routes that
    // are secured independently of Clerk still pass; everything else is
    // refused so we never expose the authenticated app by misconfiguration.
    if (isIndependentlySecuredPath(req.nextUrl.pathname)) return NextResponse.next();
    return new NextResponse(
      "Authentication is not configured. Set Clerk env vars (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY), or set ALLOW_NO_AUTH=1 to intentionally run without auth.",
      { status: 503 },
    );
  }
  if (!cachedClerkMiddleware) {
    const { clerkMiddleware, createRouteMatcher } = await import("@clerk/nextjs/server");
    const isPublicRoute = createRouteMatcher(PUBLIC_ROUTE_PATTERNS);
    cachedClerkMiddleware = clerkMiddleware(async (auth, request) => {
      if (!isPublicRoute(request)) {
        await auth.protect();
      }
    }) as unknown as typeof cachedClerkMiddleware extends infer T ? NonNullable<T> : never;
  }
  return cachedClerkMiddleware!(req, ev);
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
