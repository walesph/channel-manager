import { type NextRequest, NextResponse } from "next/server";

const clerkEnabled =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

let cachedClerkMiddleware:
  | ((req: NextRequest, ev: unknown) => Response | Promise<Response>)
  | null = null;

export default async function middleware(req: NextRequest, ev: unknown) {
  if (!clerkEnabled) return NextResponse.next();
  if (!cachedClerkMiddleware) {
    const { clerkMiddleware, createRouteMatcher } = await import("@clerk/nextjs/server");
    const isPublicRoute = createRouteMatcher([
      "/sign-in(.*)",
      "/sign-up(.*)",
      "/api/webhooks(.*)",
      // Self-check-in kiosk — guest-facing, token-gated. Bypass auth.
      "/k/(.*)",
    ]);
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
