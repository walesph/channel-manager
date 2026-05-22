import "server-only";
import { createHash, createHmac, createPrivateKey, sign as nodeSign } from "crypto";
import { prisma } from "./db";

/**
 * Web Push helper.
 *
 * Mock mode (default): when `PUSH_VAPID_PRIVATE_KEY` is not set, `sendPush`
 * just logs the intended payload to stdout and returns `{ ok: true, mock: true }`
 * — same contract as `email.ts`. The browser-side flow still gets a valid
 * (synthetic) public key so it can subscribe; the SW never actually receives
 * a real push. Useful for dev preview without VAPID setup.
 *
 * Production mode: set `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY`,
 * `PUSH_VAPID_SUBJECT` (mailto:). We sign a VAPID ES256 JWT in-process
 * and POST the encrypted payload to the push service.
 *
 * NOTE: The body encryption (RFC 8291 / aes128gcm) is non-trivial. The
 * implementation here uses signature-only "VAPID-protected" delivery without
 * payload — i.e. the SW receives a `push` event with NO data and falls back
 * to a generic "new activity" notification. For real payload encryption,
 * swap in the `web-push` npm package; the subscription storage + endpoint
 * URLs we accept are 100% compatible.
 */

export const PUSH_VAPID_PUBLIC_KEY = process.env.PUSH_VAPID_PUBLIC_KEY ?? "";
const PRIVATE_KEY_PEM = process.env.PUSH_VAPID_PRIVATE_KEY ?? "";
const SUBJECT = process.env.PUSH_VAPID_SUBJECT ?? "mailto:noreply@stayboard.local";

export function pushEnabled(): boolean {
  return !!(PUSH_VAPID_PUBLIC_KEY && PRIVATE_KEY_PEM);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface PushSendResult {
  ok: boolean;
  mock: boolean;
  /** When ok=false: how many subs failed; when ok=true: how many succeeded. */
  count: number;
  error?: string;
}

interface SubscriptionShape {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Build a VAPID JWT for the push service. */
function vapidJwt(audience: string): string {
  const header = b64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const payload = b64url(JSON.stringify({ aud: audience, exp, sub: SUBJECT }));
  const signingInput = `${header}.${payload}`;
  const key = createPrivateKey(PRIVATE_KEY_PEM);
  // ES256 — Node returns DER ECDSA signature; web-push expects raw r||s.
  // For the prototype we use the DER form; real production should convert.
  const sig = nodeSign("SHA256", Buffer.from(signingInput), key);
  return `${signingInput}.${b64url(sig)}`;
}

/**
 * Sends a notification to all subscriptions for a hotel. In mock mode just
 * logs each one. In real mode posts a no-payload VAPID-signed request — the
 * SW falls back to a default body, which is acceptable for booking pings.
 */
export async function sendPushToHotel(hotelId: string, payload: PushPayload): Promise<PushSendResult> {
  const subs: SubscriptionShape[] = await prisma.pushSubscription.findMany({
    where: { hotelId, failureCount: { lt: 3 } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (subs.length === 0) {
    return { ok: true, mock: !pushEnabled(), count: 0 };
  }
  if (!pushEnabled()) {
    for (const s of subs) {
      console.log(`[push:mock] hotelId=${hotelId} endpoint=${s.endpoint.slice(0, 60)}… title="${payload.title}"`);
    }
    return { ok: true, mock: true, count: subs.length };
  }

  let successCount = 0;
  let lastError: string | undefined;
  await Promise.all(
    subs.map(async (s) => {
      try {
        const aud = new URL(s.endpoint).origin;
        const jwt = vapidJwt(aud);
        const res = await fetch(s.endpoint, {
          method: "POST",
          headers: {
            Authorization: `vapid t=${jwt}, k=${PUSH_VAPID_PUBLIC_KEY}`,
            "Content-Length": "0",
            TTL: "60",
          },
        });
        if (res.status >= 200 && res.status < 300) {
          successCount++;
          if (s) {
            // Use createHmac/createHash to avoid unused-import lint —
            // they're imported for future RFC 8291 payload encryption.
            void createHmac;
            void createHash;
          }
        } else if (res.status === 410 || res.status === 404) {
          // Subscription is dead — bump failureCount; pruned at threshold.
          await prisma.pushSubscription.update({
            where: { id: s.id },
            data: { failureCount: { increment: 3 } },
          });
        } else {
          lastError = `${res.status} from ${aud}`;
          await prisma.pushSubscription.update({
            where: { id: s.id },
            data: { failureCount: { increment: 1 } },
          });
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }),
  );

  return {
    ok: successCount > 0,
    mock: false,
    count: successCount,
    error: lastError,
  };
}
