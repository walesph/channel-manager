import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";

const clerkEnabled =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

/**
 * Wraps children in <ClerkProvider> only when both publishable and secret keys
 * are configured. Without keys we render the app in "open dev mode" so the
 * project still boots after a fresh clone — no ClerkProvider, no protected
 * routes, currentHotelId() falls back to the first seeded hotel.
 */
export function MaybeClerkProvider({ children }: { children: ReactNode }) {
  if (!clerkEnabled) return <>{children}</>;
  return <ClerkProvider>{children}</ClerkProvider>;
}
