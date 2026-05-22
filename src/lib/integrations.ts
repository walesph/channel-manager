import "server-only";
import { prisma } from "./db";
import type { IntegrationEvent, IntegrationProvider } from "@prisma/client";

/**
 * Outbound webhook integrations (Slack / Discord).
 *
 * Both providers accept a "Incoming Webhook" URL and a JSON payload. The
 * shapes are different but small — Slack uses `text` + Block Kit, Discord
 * uses `content` + embeds. We render a minimal text message + a richer
 * "block" attachment for both, formatted per provider.
 *
 * Failures: any 4xx/5xx bumps `failureCount`. After 3 consecutive failures
 * the row is auto-disabled (set `enabled=false`) so a stale webhook URL
 * doesn't keep noise-logging.
 */

export interface IntegrationPayload {
  /** One-line summary for the notification body. */
  title: string;
  /** Longer-form description (optional). Keep <600 chars. */
  description?: string;
  /** Color hex (Slack/Discord embed accent). Defaults to brand acc. */
  color?: string;
  /** Optional URL the title links to (e.g. /bookings). */
  url?: string;
  /** Free-form key-value fields shown as a small grid in the embed. */
  fields?: Array<{ label: string; value: string; inline?: boolean }>;
}

const ACCENT_HEX = "#4f46e5";

function originFromEnv(): string {
  // Best-effort link target — production should set NEXT_PUBLIC_APP_URL.
  return process.env.NEXT_PUBLIC_APP_URL ?? "";
}

function renderSlackBody(p: IntegrationPayload): string {
  const blocks: object[] = [
    { type: "header", text: { type: "plain_text", text: p.title.slice(0, 150) } },
  ];
  if (p.description) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: p.description.slice(0, 2900) } });
  }
  if (p.fields && p.fields.length > 0) {
    blocks.push({
      type: "section",
      fields: p.fields.slice(0, 10).map((f) => ({
        type: "mrkdwn",
        text: `*${f.label}*\n${f.value}`,
      })),
    });
  }
  if (p.url) {
    blocks.push({
      type: "actions",
      elements: [
        { type: "button", text: { type: "plain_text", text: "Open in Stayboard" }, url: p.url },
      ],
    });
  }
  return JSON.stringify({ text: p.title, blocks });
}

function renderDiscordBody(p: IntegrationPayload): string {
  const embed: Record<string, unknown> = {
    title: p.title.slice(0, 256),
    color: parseInt((p.color ?? ACCENT_HEX).replace("#", ""), 16),
  };
  if (p.description) embed.description = p.description.slice(0, 4000);
  if (p.url) embed.url = p.url;
  if (p.fields && p.fields.length > 0) {
    embed.fields = p.fields.slice(0, 25).map((f) => ({
      name: f.label.slice(0, 256),
      value: f.value.slice(0, 1024),
      inline: f.inline ?? true,
    }));
  }
  return JSON.stringify({ embeds: [embed] });
}

/**
 * Fan out a payload to every enabled, subscribed integration for a hotel.
 * Returns a brief summary the caller can log; on no integrations, no-op.
 */
export async function dispatchIntegrationEvent(input: {
  hotelId: string;
  event: IntegrationEvent;
  payload: IntegrationPayload;
}): Promise<{ delivered: number; failed: number }> {
  const targets = await prisma.outboundIntegration.findMany({
    where: { hotelId: input.hotelId, enabled: true, events: { has: input.event } },
  });
  if (targets.length === 0) return { delivered: 0, failed: 0 };

  // Add an absolute URL when the payload only has a relative path.
  const origin = originFromEnv();
  const payload: IntegrationPayload = {
    ...input.payload,
    url: input.payload.url
      ? input.payload.url.startsWith("http")
        ? input.payload.url
        : origin
        ? `${origin}${input.payload.url}`
        : input.payload.url
      : undefined,
  };

  let delivered = 0;
  let failed = 0;

  await Promise.all(
    targets.map(async (t) => {
      try {
        const body = t.provider === "slack" ? renderSlackBody(payload) : renderDiscordBody(payload);
        const res = await fetch(t.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (res.ok || res.status === 204) {
          delivered++;
          await prisma.outboundIntegration.update({
            where: { id: t.id },
            data: { successCount: { increment: 1 }, failureCount: 0, lastFiredAt: new Date() },
          });
        } else {
          failed++;
          // Auto-disable after 3 consecutive failures (current + 2 prior).
          const shouldDisable = t.failureCount >= 2;
          await prisma.outboundIntegration.update({
            where: { id: t.id },
            data: {
              failureCount: { increment: 1 },
              lastFiredAt: new Date(),
              enabled: shouldDisable ? false : t.enabled,
            },
          });
        }
      } catch {
        failed++;
        await prisma.outboundIntegration.update({
          where: { id: t.id },
          data: { failureCount: { increment: 1 }, lastFiredAt: new Date() },
        });
      }
    }),
  );
  return { delivered, failed };
}

/**
 * Validates a webhook URL by sending a "test" message. Returns ok=true if
 * the provider responded 2xx. Doesn't persist anything.
 */
export async function pingWebhook(input: { provider: IntegrationProvider; url: string; label: string }): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const payload: IntegrationPayload = {
      title: `Stayboard test — ${input.label}`,
      description: "If you see this, the integration is wired correctly.",
      color: ACCENT_HEX,
    };
    const body = input.provider === "slack" ? renderSlackBody(payload) : renderDiscordBody(payload);
    const res = await fetch(input.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    return { ok: res.ok || res.status === 204, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
