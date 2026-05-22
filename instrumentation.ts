/**
 * Next.js instrumentation hook — runs once when the runtime spins up.
 *
 * Currently logs basic startup info to stdout so deployment logs make it
 * obvious which build is live. Future hooks can attach OpenTelemetry,
 * Sentry, etc. here without touching the per-request code.
 *
 * The slow-query DB capture lives in `src/lib/db.ts` directly because it
 * needs the Prisma client instance — this file is just for global setup.
 */

export async function register() {
  // Only run in Node.js runtime (not edge); the import below pulls in
  // Node-only built-ins via prisma.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const slowMs = parseInt(process.env.SLOW_QUERY_MS ?? "500", 10);
  const slowEnabled = process.env.SLOW_QUERY_LOG !== "off";
  // eslint-disable-next-line no-console
  console.log(
    `[stayboard] runtime=${process.env.NEXT_RUNTIME} ` +
      `node=${process.version} ` +
      `slow_query_log=${slowEnabled ? `on (>${slowMs}ms)` : "off"} ` +
      `started=${new Date().toISOString()}`,
  );
}
