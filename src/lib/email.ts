import "server-only";

/**
 * Email sender with a mock fallback for dev/test.
 *
 * Real mode: when `RESEND_API_KEY` is set, sends via Resend's HTTP API
 * (no SDK dependency — keeps the bundle small).
 *
 * Mock mode: logs structured payloads to stdout so dev preview can verify
 * intent without sending real emails. Returns `{ ok: true, mock: true }`
 * so callers can branch on `result.mock` if they want to surface "(mock)"
 * in the UI.
 *
 * Idempotency is the caller's responsibility — typically via a BookingEvent
 * tag check (see automations.ts).
 */

export interface EmailPayload {
  to: string;
  subject: string;
  /** Plain-text body. HTML is intentionally not supported here — keeps
   *  templates simple and dodges accidental injection. */
  body: string;
  /** Free-form audit tag, e.g. `"checkin-reminder:bookingId-cuid"`. */
  tag: string;
}

export interface EmailResult {
  ok: boolean;
  mock: boolean;
  /** Provider message id when sent for real, mock id otherwise. */
  id?: string;
  error?: string;
}

const FROM_ADDRESS = process.env.STAYBOARD_EMAIL_FROM ?? "Stayboard <noreply@stayboard.local>";

export function emailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  // Sanity guards — bad addresses are common bugs, fail loudly.
  if (!payload.to || !payload.to.includes("@")) {
    return { ok: false, mock: false, error: `invalid recipient: ${payload.to}` };
  }
  if (!payload.subject || !payload.body) {
    return { ok: false, mock: false, error: "subject and body required" };
  }

  if (!emailEnabled()) {
    // Mock mode: structured log + synthetic id. Useful for grep'ing dev logs.
    const mockId = `mock-${Date.now().toString(36)}`;
    console.log(`[email:mock] tag=${payload.tag} to=${payload.to} subject="${payload.subject}" id=${mockId}`);
    return { ok: true, mock: true, id: mockId };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: payload.to,
        subject: payload.subject,
        text: payload.body,
        // Resend supports per-message tags for filtering in their dashboard.
        tags: [{ name: "stayboard", value: payload.tag.split(":")[0] ?? "automation" }],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "<unreadable>");
      return { ok: false, mock: false, error: `resend ${res.status}: ${errBody.slice(0, 200)}` };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, mock: false, id: json.id };
  } catch (e) {
    return { ok: false, mock: false, error: e instanceof Error ? e.message : String(e) };
  }
}
