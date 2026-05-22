import { getRecentActivity, type ActivityItem } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream of recent activity for the bell dropdown.
 *
 * Why SSE (not WebSocket): we only push from server → client, retries are
 * built-in (`retry:` directive), and HTTP is cache-/proxy-friendly. Cheap to
 * deploy on Vercel which terminates idle streams at ~5 min — the client
 * automatically reconnects via the EventSource API.
 *
 * Implementation: poll the same `getRecentActivity` query every POLL_MS,
 * diff against the per-connection "lastSeenIso" cursor, and emit only items
 * newer than the cursor as `event: activity` SSE frames. Sends `event: ping`
 * every 25s to keep proxies from killing the connection.
 *
 * Future upgrade path: swap the inner poll for a `LISTEN stayboard_activity`
 * loop driven by Postgres triggers. The wire format below stays identical
 * so clients don't need to change.
 */

const POLL_MS = 5_000;
const PING_MS = 25_000;
const MAX_DURATION_MS = 4 * 60_000; // close cleanly before Vercel's 5-min limit
const ENC = new TextEncoder();

function sseFrame(event: string, data: unknown, id?: string): Uint8Array {
  let payload = `event: ${event}\n`;
  if (id) payload += `id: ${id}\n`;
  payload += `data: ${JSON.stringify(data)}\n\n`;
  return ENC.encode(payload);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  // Cursor: client may send `?since=ISO` to skip backlog. Defaults to "now"
  // so the bell shows brand-new events only (initial state already rendered SSR).
  let cursorIso = url.searchParams.get("since") ?? new Date().toISOString();
  const startMs = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (chunk: Uint8Array) => {
        try {
          controller.enqueue(chunk);
        } catch {
          // Stream closed (client disconnected) — ignore.
        }
      };

      // Open with a hello frame + retry directive so EventSource auto-reconnects with 3s backoff
      safeEnqueue(ENC.encode(`retry: 3000\n\n`));
      safeEnqueue(sseFrame("hello", { now: new Date().toISOString() }));

      const tick = async () => {
        try {
          const items: ActivityItem[] = await getRecentActivity(50);
          const fresh = items.filter((a) => a.occurredAt > cursorIso);
          if (fresh.length > 0) {
            // Newest cursor advances so we never re-emit the same item.
            cursorIso = fresh[0].occurredAt;
            for (const a of [...fresh].reverse()) {
              safeEnqueue(sseFrame("activity", a, a.id));
            }
          }
        } catch (e) {
          safeEnqueue(sseFrame("error", { message: e instanceof Error ? e.message : String(e) }));
        }
      };

      const pollTimer = setInterval(tick, POLL_MS);
      const pingTimer = setInterval(() => safeEnqueue(sseFrame("ping", { t: Date.now() })), PING_MS);

      const cleanup = () => {
        clearInterval(pollTimer);
        clearInterval(pingTimer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // Hard timeout so we close cleanly before the platform kills us
      const maxTimer = setTimeout(cleanup, MAX_DURATION_MS);

      // Client disconnect (browser close / navigation)
      req.signal.addEventListener("abort", () => {
        clearTimeout(maxTimer);
        cleanup();
      });

      // Run an immediate first tick so the cursor is correct without waiting POLL_MS
      void tick();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Prevent Nginx-style buffering on intermediaries
      "X-Accel-Buffering": "no",
      // CORS noop in our setup but explicit
      "Access-Control-Allow-Origin": "*",
      "X-Stream-Started-At": new Date(startMs).toISOString(),
    },
  });
}
