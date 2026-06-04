/**
 * Injectable "now". In production (no override) this is just the wall clock, so
 * behavior is unchanged. When `STAYBOARD_NOW` is set to an ISO timestamp, every
 * date computation that routes through here is frozen to that instant — which
 * makes data-driven pages render deterministically for visual-regression
 * snapshots (paired with a seed anchored to the same instant).
 *
 * No `server-only` import on purpose: the seed script runs standalone under
 * tsx, outside Next's bundler, and must be able to import this.
 */
export function now(): Date {
  const override = process.env.STAYBOARD_NOW;
  if (override) {
    const d = new Date(override);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/** Milliseconds since epoch for the (possibly frozen) current instant. */
export function nowMs(): number {
  return now().getTime();
}
