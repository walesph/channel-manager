import "server-only";
import { prisma } from "./db";
import type { WebhookProvider, WebhookStatus } from "@prisma/client";

/**
 * Persist a webhook hit. Called from each `api/webhooks/*` route after the
 * handler returns. Truncates response body to 4KB so a noisy provider doesn't
 * blow up storage. Failures here are swallowed — the webhook handler itself
 * is the source of truth, this is observability.
 */
export async function logWebhook(input: {
  provider: WebhookProvider;
  eventType?: string | null;
  status: WebhookStatus;
  httpStatus: number;
  responseBody?: string | null;
  headers: Headers;
  body: string;
  durationMs: number;
}): Promise<void> {
  try {
    const headersObj: Record<string, string> = {};
    for (const [k, v] of input.headers.entries()) {
      // Strip the host's authorization on the way in — we never want to persist creds.
      if (k.toLowerCase() === "authorization") continue;
      headersObj[k] = v;
    }
    await prisma.webhookLog.create({
      data: {
        provider: input.provider,
        eventType: input.eventType ?? null,
        status: input.status,
        httpStatus: input.httpStatus,
        responseBody: input.responseBody ? input.responseBody.slice(0, 4096) : null,
        headers: headersObj as object,
        body: input.body.slice(0, 16_384),
        durationMs: input.durationMs,
      },
    });
  } catch (e) {
    console.error("[webhook-log] failed to persist:", e instanceof Error ? e.message : e);
  }
}
