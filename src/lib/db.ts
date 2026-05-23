import { PrismaClient, Prisma } from "@prisma/client";
import { tenantHotelStore } from "./tenant-scope";

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
/**
 * Whether to persist raw query *parameters* alongside slow queries. Params can
 * contain guest PII (emails, names) and the log is viewable at /admin/perf, so
 * this is OFF by default — params are stored as "[redacted]". Set
 * `SLOW_QUERY_LOG_PARAMS=on` to capture real values in a controlled debug env.
 */
const SLOW_QUERY_LOG_PARAMS = process.env.SLOW_QUERY_LOG_PARAMS === "on";

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
      // Params may contain guest PII — redact unless explicitly opted in.
      const safeParams = SLOW_QUERY_LOG_PARAMS
        ? e.params.length > 240 ? `${e.params.slice(0, 240)}…` : e.params
        : "[redacted]";
      // Fire-and-forget so we never block the request path.
      void client.slowQueryLog
        .create({
          data: { query: truncQuery, params: safeParams, durationMs: Math.round(e.duration) },
        })
        .catch(() => undefined)
        .finally(() => { inLog = false; });
    });
  }
  return client;
}

export const prisma = globalForPrisma.prisma ?? makePrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Runs `fn` inside a transaction with the Postgres RLS tenant GUC
 * (`app.current_hotel_id`) bound to `hotelId`. Inside the callback EVERY query
 * is restricted to that hotel by the row-level-security policies — a
 * defense-in-depth net beneath the app's own `where: { hotelId }` filters, so
 * a query that forgets to scope still cannot read or write another tenant's
 * rows.
 *
 * Use this for session-originated access where the tenant is known. Trusted
 * server-to-server paths (webhooks, cron, provisioning, seed) intentionally
 * keep using the global `prisma` client with NO tenant context, where the
 * policies are permissive.
 *
 * The GUC is set with `is_local = true`, so it is scoped to each operation's
 * transaction and never leaks onto the pooled connection afterwards.
 *
 * Establishes the scope via AsyncLocalStorage and runs `fn`. It does NOT open a
 * single shared transaction, so concurrent reads inside `fn` (e.g. via
 * `Promise.all`) each get their own connection. Re-entrant by nature: nested
 * `withTenant` calls just re-set the same id in the store.
 */
export function withTenant<T>(hotelId: string, fn: () => Promise<T>): Promise<T> {
  return tenantHotelStore.run(hotelId, fn);
}

/**
 * Runs `fn` inside a single interactive transaction with the RLS tenant GUC
 * bound to `hotelId`, passing the transaction client. Use this for mutations
 * that must be atomic across several statements (the cases that previously used
 * `prisma.$transaction([...])`): all `tx` operations are both atomic AND
 * tenant-scoped. The GUC is set with `is_local = true`, scoped to this
 * transaction only.
 */
export function withTenantTx<T>(
  hotelId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_hotel_id', ${hotelId}, true)`;
    return fn(tx);
  });
}

/**
 * A Prisma client that auto-scopes to the active tenant. When a hotel id is in
 * `tenantHotelStore` (i.e. inside `withTenant`), every model operation runs in
 * its own short transaction that first binds the RLS GUC, so the
 * row-level-security policies restrict it to that hotel — a defense-in-depth
 * net beneath the app's explicit `where: { hotelId }` filters. Outside a scope
 * it behaves exactly like the global client (RLS policies are permissive with
 * no GUC set).
 *
 * The tenant id is read in the Proxy's *synchronous* property getter — i.e. at
 * the call site, while still inside `withTenant`'s `run()` — NOT inside a
 * Prisma `$extends` callback, which the engine invokes on a later async tick
 * where AsyncLocalStorage context is not reliably propagated.
 *
 * Each operation is its own transaction (rather than one shared interactive
 * transaction per request), so concurrent `Promise.all([...])` reads each get
 * their own connection instead of being multiplexed onto one.
 *
 * Import this in place of `prisma` from modules whose queries are
 * session-scoped (e.g. queries.ts). Trusted server-to-server paths (webhooks,
 * cron, provisioning, seed) keep using the global `prisma` with no context.
 */
export const scopedPrisma: PrismaClient = new Proxy(prisma, {
  get(base, prop, receiver) {
    const value = Reflect.get(base, prop, receiver);
    const hotelId = tenantHotelStore.getStore();
    // No active scope, symbol keys, or top-level methods ($queryRaw, $connect…):
    // pass straight through to the global client.
    if (!hotelId || typeof prop !== "string" || typeof value !== "object" || value === null) {
      return typeof value === "function" ? value.bind(base) : value;
    }
    // `value` is a model delegate (e.g. prisma.booking). Wrap each of its
    // operations so the call runs in a GUC-bound transaction for `hotelId`.
    const modelKey = prop;
    return new Proxy(value as object, {
      get(delegate, opProp) {
        const opVal = Reflect.get(delegate, opProp);
        if (typeof opVal !== "function" || typeof opProp !== "string") return opVal;
        return (args: unknown) =>
          prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.current_hotel_id', ${hotelId}, true)`;
            const txDelegate = (tx as unknown as Record<string, Record<string, (a: unknown) => Promise<unknown>>>)[
              modelKey
            ];
            return txDelegate[opProp](args);
          });
      },
    });
  },
});
