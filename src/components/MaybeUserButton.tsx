"use client";

import { UserButton } from "@clerk/nextjs";

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export function MaybeUserButton() {
  if (!clerkEnabled) return null;
  return (
    <div style={{ display: "inline-flex", alignItems: "center" }}>
      <UserButton appearance={{ elements: { avatarBox: { width: 26, height: 26 } } }} />
    </div>
  );
}
