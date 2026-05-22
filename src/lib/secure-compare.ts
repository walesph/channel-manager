import { createHash, timingSafeEqual } from "crypto";

/**
 * Constant-time string comparison for secrets (CRON_SECRET, WEBHOOK_SECRET,
 * etc.). Both inputs are hashed to a fixed 32-byte digest before comparison so
 * that neither the result nor the timing leaks the secret's length or content.
 *
 * Returns false for null/undefined inputs.
 */
export function secureCompare(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  // Digests are always equal length, so timingSafeEqual never throws here.
  return timingSafeEqual(ha, hb);
}
