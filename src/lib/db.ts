import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Slow-query threshold (ms). Queries slower than this are persisted to the
 * `SlowQueryLog` table for /admin/perf review. Tunable via env so production
 * can run hotter (e.g. 1000ms) than dev preview (default 500ms).
 *
 * The actual capture also runs in production — kept on by default so the
 * /admin/perf board has data after launch. Set `SLOW_QUERY_LOG=off` to disable.
 */
const SLOW_QUERY_MS = parseInt(process.env.SLOW_QUERY_MS ?? "500", 10);
const SLOW_QUERY_ENABLED = process.env.SLOW_QUERY_LOG !== "off";

function makePrisma(): PrismaClient {
  const client = new PrismaClient({
    log: SLOW_QUERY_ENABLED
      ? [{ emit: "event", level: "query" }, "error", "warn"]
      : ["error", "warn"],
  });

  if (SLOW_QUERY_ENABLED) {
    // Use the `query` event to measure latency. Logging the slow rows itself
    // creates more queries — we guard with `inLog` so we don't recursively
    // capture the slow-log INSERT itself.
    let inLog = false;
    client.$on("query", (e: Prisma.QueryEvent) => {
      if (inLog) return;
      if (e.duration < SLOW_QUERY_MS) return;
      // Skip the slow-log table's own writes / reads to avoid loops.
      if (e.query.includes('"SlowQueryLog"')) return;
      inLog = true;
      const truncQuery = e.query.length > 240 ? `${e.query.slice(0, 240)}…` : e.query;
      const truncParams = e.params.length > 240 ? `${e.params.slice(0, 240)}…` : e.params;
      // Fire-and-forget so we never block the request path.
      void client.slowQueryLog
        .create({
          data: { query: truncQuery, params: truncParams, durationMs: Math.round(e.duration) },
        })
        .catch(() => undefined)
        .finally(() => { inLog = false; });
    });
  }
  return client;
}

export const prisma = globalForPrisma.prisma ?? makePrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
