import "server-only";

/**
 * Hostaway Channel Manager API client.
 *
 * Real API: https://api.hostaway.com/documentation
 *   - OAuth2: POST /accessTokens with client_credentials
 *   - GET /reservations?channelId=…&listingId=…
 *   - PUT /listings/{id}/calendar  (rates + restrictions)
 *
 * If HOSTAWAY_API_KEY env is set, calls the real API. Otherwise returns mock
 * data so the UI is exercisable end-to-end without a sandbox account.
 */

const apiKey = process.env.HOSTAWAY_API_KEY;
const accountId = process.env.HOSTAWAY_ACCOUNT_ID;
const baseUrl = process.env.HOSTAWAY_BASE_URL ?? "https://api.hostaway.com/v1";

export const hostawayMode: "real" | "mock" = apiKey && accountId ? "real" : "mock";

export interface HostawayReservation {
  id: string;
  channelName: string;
  /** OTA listing identifier (matches our ChannelMap.externalId) */
  listingId: string | null;
  guestName: string;
  arrivalDate: string; // yyyy-mm-dd
  departureDate: string;
  totalPrice: number;
  currency: string;
  channelReservationId: string;
}

export interface HostawayPullResult {
  ok: true;
  mode: "real" | "mock";
  reservations: HostawayReservation[];
}

export interface MockSeedListingIds {
  /** Real ChannelMap externalIds the mock can choose from (per channel type). */
  byChannel: Record<string, string[]>;
}

export async function fetchHostawayReservations(
  propertyId: string,
  mockSeed?: MockSeedListingIds,
): Promise<HostawayPullResult> {
  if (hostawayMode === "real") {
    const token = await fetchAccessToken();
    const res = await fetch(`${baseUrl}/reservations?listingId=${encodeURIComponent(propertyId)}&limit=50`, {
      headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" },
    });
    if (!res.ok) throw new Error(`Hostaway API error ${res.status}`);
    const data = (await res.json()) as { result?: HostawayReservationApi[] };
    return {
      ok: true,
      mode: "real",
      reservations: (data.result ?? []).map(adaptReservation),
    };
  }
  // Mock — synthesize a realistic-looking handful of reservations
  return { ok: true, mode: "mock", reservations: mockReservations(propertyId, mockSeed) };
}

interface HostawayReservationApi {
  id: number;
  channelName?: string;
  channelId?: number;
  listingId?: string | number | null;
  guestName?: string;
  arrivalDate?: string;
  departureDate?: string;
  totalPrice?: number;
  currency?: string;
  channelReservationId?: string;
}

function adaptReservation(r: HostawayReservationApi): HostawayReservation {
  return {
    id: String(r.id),
    channelName: r.channelName ?? "unknown",
    listingId: r.listingId ? String(r.listingId) : null,
    guestName: r.guestName ?? "Guest",
    arrivalDate: r.arrivalDate ?? "",
    departureDate: r.departureDate ?? "",
    totalPrice: r.totalPrice ?? 0,
    currency: r.currency ?? "KRW",
    channelReservationId: r.channelReservationId ?? "",
  };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function fetchAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  const res = await fetch(`${baseUrl}/accessTokens`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: accountId!,
      client_secret: apiKey!,
      scope: "general",
    }).toString(),
  });
  if (!res.ok) throw new Error(`Hostaway auth failed ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedToken.token;
}

// ── Outbound: rate + inventory push ───────────────────────────────────

export interface InventoryPushItem {
  /** Hostaway listingId — usually our ChannelMap.externalId. */
  listingId: string;
  date: string; // YYYY-MM-DD
  available: number;
  /** When set, also writes the per-night price. */
  price?: number;
  /** When true, blocks the date (CTA closed). */
  closed?: boolean;
  /** Min stay in nights. */
  minStay?: number;
}

export interface HostawayPushResult {
  ok: boolean;
  mode: "real" | "mock";
  /** Items the API confirmed. */
  pushed: number;
  /** Items skipped due to validation errors (mode=mock returns 0). */
  skipped: number;
  /** Per-listing summary for the UI. */
  perListing: { listingId: string; updates: number }[];
  error?: string;
}

/**
 * Push inventory + rates to Hostaway. In real mode hits
 * `PUT /listings/{id}/calendar` (one batch per listing). Mock mode echoes
 * back what would have been pushed — useful for confidence-checking a
 * bulk-edit before swapping in real creds.
 */
export async function pushInventoryAndRates(items: InventoryPushItem[]): Promise<HostawayPushResult> {
  // Group by listingId so we can issue one calendar PUT per property.
  const byListing = new Map<string, InventoryPushItem[]>();
  for (const i of items) {
    const arr = byListing.get(i.listingId) ?? [];
    arr.push(i);
    byListing.set(i.listingId, arr);
  }

  if (hostawayMode === "mock") {
    return {
      ok: true,
      mode: "mock",
      pushed: items.length,
      skipped: 0,
      perListing: Array.from(byListing.entries()).map(([listingId, updates]) => ({
        listingId,
        updates: updates.length,
      })),
    };
  }

  try {
    const token = await fetchAccessToken();
    let pushed = 0;
    const perListing: { listingId: string; updates: number }[] = [];
    for (const [listingId, updates] of byListing.entries()) {
      const body = updates.map((u) => ({
        date: u.date,
        availableCount: u.available,
        price: u.price,
        isAvailable: !u.closed,
        minimumStay: u.minStay,
      }));
      const res = await fetch(`${baseUrl}/listings/${encodeURIComponent(listingId)}/calendar`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        return { ok: false, mode: "real", pushed, skipped: items.length - pushed, perListing, error: `${listingId}: HTTP ${res.status}` };
      }
      pushed += updates.length;
      perListing.push({ listingId, updates: updates.length });
    }
    return { ok: true, mode: "real", pushed, skipped: 0, perListing };
  } catch (e) {
    return { ok: false, mode: "real", pushed: 0, skipped: items.length, perListing: [], error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Credential validation ─────────────────────────────────────────────

export interface CredentialValidationResult {
  ok: boolean;
  mode: "real" | "mock";
  /** Hostaway account/property name when real mode succeeds. */
  accountLabel?: string;
  /** Listings the credentials can see (count) — sanity check. */
  listingCount?: number;
  error?: string;
}

/**
 * Issues a low-impact GET against the listings endpoint to confirm the
 * credentials work + the account has the expected listing count. Doesn't
 * mutate any state.
 *
 * Mock mode: returns a synthetic "ok" result so the UI stays clickable
 * without env config.
 */
export async function validateHostawayCredentials(testApiKey?: string, testAccountId?: string): Promise<CredentialValidationResult> {
  // When both inline test creds are supplied AND env creds are absent we run
  // the real flow with the test creds. Otherwise we honor `hostawayMode`.
  const useReal = (testApiKey && testAccountId) || hostawayMode === "real";
  if (!useReal) {
    return { ok: true, mode: "mock", accountLabel: "Mock Account", listingCount: 0 };
  }
  try {
    const tokenRes = await fetch(`${baseUrl}/accessTokens`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: testAccountId ?? accountId!,
        client_secret: testApiKey ?? apiKey!,
        scope: "general",
      }).toString(),
    });
    if (!tokenRes.ok) {
      return { ok: false, mode: "real", error: `auth failed: HTTP ${tokenRes.status}` };
    }
    const tokenData = (await tokenRes.json()) as { access_token: string };
    const listRes = await fetch(`${baseUrl}/listings?limit=1`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!listRes.ok) {
      return { ok: false, mode: "real", error: `listings probe failed: HTTP ${listRes.status}` };
    }
    const listData = (await listRes.json()) as { count?: number; result?: Array<{ name?: string }> };
    return {
      ok: true,
      mode: "real",
      accountLabel: listData.result?.[0]?.name ?? "Hostaway",
      listingCount: listData.count ?? 0,
    };
  } catch (e) {
    return { ok: false, mode: "real", error: e instanceof Error ? e.message : String(e) };
  }
}

function mockReservations(propertyId: string, seed?: MockSeedListingIds): HostawayReservation[] {
  const channels = ["airbnb", "booking", "agoda", "trip"];
  const names = ["Park Joon", "Sato Yui", "Liu Wei", "Anna Berg", "James Liu"];
  const today = new Date();
  return Array.from({ length: 5 }, (_, i) => {
    const ci = new Date(today);
    ci.setUTCDate(ci.getUTCDate() + i + 2);
    const co = new Date(ci);
    co.setUTCDate(co.getUTCDate() + (1 + (i % 3)));
    const channel = channels[i % channels.length];
    const listings = seed?.byChannel?.[channel] ?? [];
    const listingId = listings.length > 0 ? listings[i % listings.length] : null;
    return {
      id: `mock-${propertyId}-${i}`,
      channelName: channel,
      listingId,
      guestName: names[i % names.length],
      arrivalDate: ci.toISOString().slice(0, 10),
      departureDate: co.toISOString().slice(0, 10),
      totalPrice: 120_000 * (1 + (i % 3)),
      currency: "KRW",
      channelReservationId: `${channel.toUpperCase()}-${100000 + i}`,
    };
  });
}
