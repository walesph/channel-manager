import "server-only";

/**
 * Mock competitor pricing — in real life this comes from a rate-shopping API
 * (e.g. AirDNA, OTA Insight, RateGain Parity). For dev we synthesize a stable
 * "comp set average" per (roomType, date) using a deterministic hash so the
 * same date always returns the same number.
 */
export function competitorAvgRate(roomTypeId: string, isoDate: string, baseRate: number): number {
  const seed = simpleHash(`${roomTypeId}:${isoDate}`);
  // Comp set hovers between 0.88x and 1.18x of baseRate
  const factor = 0.88 + ((seed % 31) / 100);
  return Math.round((baseRate * factor) / 1000) * 1000;
}

/**
 * Holiday + market-event calendar for Korean hospitality.
 *
 * Events fall into categories that affect pricing differently:
 *   - "public_holiday"   official KR public holiday (high family demand)
 *   - "school_break"     uni/elementary breaks (long-stay demand)
 *   - "concert_event"    major K-pop / sport events (peak demand)
 *   - "shopping"         11.11, Black Friday-like (lower hotel demand)
 *
 * The pricing engine multiplies the rate by `multiplier`. Marker-only events
 * (school_break, shopping) keep multiplier ~1.0 but show on the dashboard so
 * operators can plan promotions.
 *
 * Two indexing strategies:
 *   1. Recurring: keyed by `MM-DD` — applies every year. Used for fixed-date
 *      holidays like Christmas, Children's Day.
 *   2. Specific: keyed by `YYYY-MM-DD` — applies only that year. Used for
 *      lunar holidays (Seollal/Chuseok) which shift each year, and for
 *      one-off events like a confirmed K-pop concert.
 */
export type EventCategory = "public_holiday" | "school_break" | "concert_event" | "shopping";

export interface MarketEvent {
  label: string;
  category: EventCategory;
  multiplier: number;
}

const RECURRING: Record<string, MarketEvent> = {
  "01-01": { label: "신정", category: "public_holiday", multiplier: 1.2 },
  "02-13": { label: "발렌타인 인근", category: "concert_event", multiplier: 1.08 },
  "02-14": { label: "발렌타인", category: "concert_event", multiplier: 1.12 },
  "03-01": { label: "삼일절", category: "public_holiday", multiplier: 1.15 },
  "05-05": { label: "어린이날", category: "public_holiday", multiplier: 1.18 },
  "05-04": { label: "어린이날 인근", category: "public_holiday", multiplier: 1.1 },
  "06-06": { label: "현충일", category: "public_holiday", multiplier: 1.1 },
  "08-15": { label: "광복절", category: "public_holiday", multiplier: 1.15 },
  "10-03": { label: "개천절", category: "public_holiday", multiplier: 1.1 },
  "10-09": { label: "한글날", category: "public_holiday", multiplier: 1.08 },
  "11-11": { label: "11.11 쇼핑", category: "shopping", multiplier: 1.0 },
  "12-24": { label: "크리스마스 이브", category: "concert_event", multiplier: 1.18 },
  "12-25": { label: "크리스마스", category: "public_holiday", multiplier: 1.22 },
  "12-31": { label: "연말", category: "concert_event", multiplier: 1.25 },
};

/**
 * Lunar holidays shift each year — table of dates for Seollal (음력 1/1) +
 * Chuseok (음력 8/15) ± surrounding days. Source: KR public-holiday tables.
 * Update this table once a year.
 */
const SPECIFIC: Record<string, MarketEvent> = {
  // ── 2026 (current SaaS year) ─────────────────────────────────────────
  "2026-02-16": { label: "설날 연휴", category: "public_holiday", multiplier: 1.18 },
  "2026-02-17": { label: "설날", category: "public_holiday", multiplier: 1.25 },
  "2026-02-18": { label: "설날 연휴", category: "public_holiday", multiplier: 1.18 },
  "2026-09-24": { label: "추석 연휴", category: "public_holiday", multiplier: 1.18 },
  "2026-09-25": { label: "추석", category: "public_holiday", multiplier: 1.25 },
  "2026-09-26": { label: "추석 연휴", category: "public_holiday", multiplier: 1.18 },
  "2026-04-15": { label: "총선", category: "public_holiday", multiplier: 1.05 },
  // School breaks (informational; multiplier=1 so price isn't bumped)
  "2026-07-20": { label: "여름방학 시작", category: "school_break", multiplier: 1.0 },
  "2026-12-23": { label: "겨울방학 시작", category: "school_break", multiplier: 1.0 },
  // ── 2027 placeholder so cron doesn't go blind on new year ────────────
  "2027-02-06": { label: "설날 연휴", category: "public_holiday", multiplier: 1.18 },
  "2027-02-07": { label: "설날", category: "public_holiday", multiplier: 1.25 },
  "2027-02-08": { label: "설날 연휴", category: "public_holiday", multiplier: 1.18 },
};

export function eventFor(isoDate: string): MarketEvent | null {
  // Specific date wins over recurring (e.g. if a one-off event lands on 12/25).
  if (SPECIFIC[isoDate]) return SPECIFIC[isoDate];
  const md = isoDate.slice(5);
  return RECURRING[md] ?? null;
}

/**
 * All events in `[startIso, endIso]` (inclusive). Used by the calendar to
 * mark holiday strips + by the dashboard "upcoming events" widget.
 */
export function eventsInRange(startIso: string, endIso: string): { date: string; event: MarketEvent }[] {
  const out: { date: string; event: MarketEvent }[] = [];
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const ev = eventFor(iso);
    if (ev) out.push({ date: iso, event: ev });
  }
  return out;
}

function simpleHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
