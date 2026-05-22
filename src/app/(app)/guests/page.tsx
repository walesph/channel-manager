import { getGuestCrm, type GuestCrmFilter } from "@/lib/queries";
import { GuestsClient } from "./GuestsClient";

export const dynamic = "force-dynamic";

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseInt0(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = parseInt(raw.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; country?: string; tag?: string; minLtv?: string; upcoming?: string }>;
}) {
  const sp = await searchParams;
  const filter: GuestCrmFilter = {
    q: sp.q?.trim() || undefined,
    countries: parseList(sp.country),
    tags: parseList(sp.tag),
    minLtv: parseInt0(sp.minLtv),
    hasUpcoming: sp.upcoming === "1",
  };
  const data = await getGuestCrm(filter, 200);
  return (
    <GuestsClient
      data={data}
      initialFilter={{
        q: filter.q ?? "",
        countries: filter.countries ?? [],
        tags: filter.tags ?? [],
        minLtv: filter.minLtv ?? 0,
        hasUpcoming: filter.hasUpcoming ?? false,
      }}
    />
  );
}
