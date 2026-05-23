import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Holds the active tenant's hotel id for the current async context. When set
 * (by `withTenant` in db.ts), the `scopedPrisma` client wraps every operation
 * in a short transaction that binds the Postgres RLS GUC `app.current_hotel_id`
 * to this id — so all reads/writes are restricted to the bound hotel by the
 * row-level-security policies. When unset, `scopedPrisma` behaves like the
 * global client with no tenant context (RLS policies are permissive there).
 *
 * Storing the id (not a transaction client) keeps each query independent, so
 * concurrent `Promise.all([...])` reads each get their own connection — they
 * are not multiplexed onto a single shared interactive transaction.
 *
 * Kept in its own module (no `./db` import) to avoid an import cycle.
 */
export const tenantHotelStore = new AsyncLocalStorage<string>();
