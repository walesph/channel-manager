import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Hotel owner read-only iCal feed.
 *
 * Distinct from `/api/ical/[token]` (per-channel sync feed) — this aggregates
 * ALL bookings across every channel into a single calendar. Designed for
 * subscribing in Google/Apple Cal so the operator sees their day at a glance.
 *
 * Localization: pass `?lang=ko|en|ja|zh` to translate SUMMARY/DESCRIPTION.
 * Defaults to "ko" — matches the Stayboard SaaS default.
 *
 * URL format:
 *   /api/ical/hotel/{token}.ics   ← .ics suffix optional, helps clients sniff
 *   /api/ical/hotel/{token}?lang=en
 */

interface Params { token: string }

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function toIcalDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}
function toIcalTimestamp(d: Date): string {
  return `${toIcalDate(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
/** RFC 5545 § 3.1 — long lines must be folded at 75 octets. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let i = 0;
  parts.push(line.slice(0, 75));
  i = 75;
  while (i < line.length) {
    parts.push(" " + line.slice(i, i + 74));
    i += 74;
  }
  return parts.join("\r\n");
}

type Lang = "ko" | "en" | "ja" | "zh";
const STR: Record<Lang, { summary: (g: string, ch: string) => string; nights: string; total: string; ref: string; channel: string; description: string }> = {
  ko: {
    summary: (g, ch) => `${g} · ${ch}`,
    nights: "박",
    total: "총액",
    ref: "예약번호",
    channel: "채널",
    description: "Stayboard 호텔 예약",
  },
  en: {
    summary: (g, ch) => `${g} · ${ch}`,
    nights: "nights",
    total: "Total",
    ref: "Ref",
    channel: "Channel",
    description: "Stayboard hotel booking",
  },
  ja: {
    summary: (g, ch) => `${g} · ${ch}`,
    nights: "泊",
    total: "合計",
    ref: "予約番号",
    channel: "チャネル",
    description: "Stayboard ホテル予約",
  },
  zh: {
    summary: (g, ch) => `${g} · ${ch}`,
    nights: "晚",
    total: "总额",
    ref: "预订号",
    channel: "渠道",
    description: "Stayboard 酒店预订",
  },
};

function pickLang(raw: string | null): Lang {
  const v = (raw ?? "ko").toLowerCase();
  if (v.startsWith("ko")) return "ko";
  if (v.startsWith("en")) return "en";
  if (v.startsWith("ja")) return "ja";
  if (v.startsWith("zh")) return "zh";
  return "ko";
}

export async function GET(req: Request, ctx: { params: Promise<Params> }) {
  const { token } = await ctx.params;
  const cleaned = token.replace(/\.ics$/i, "");
  const url = new URL(req.url);
  const lang = pickLang(url.searchParams.get("lang"));

  const hotel = await prisma.hotel.findUnique({
    where: { ownerICalToken: cleaned },
  });
  if (!hotel) {
    return new Response("Not found", { status: 404 });
  }

  // Pull confirmed/in-house/checked-out bookings across ALL channels for this hotel.
  // Cancelled bookings are intentionally omitted — calendar consumers don't
  // want noise from cancelled events.
  const bookings = await prisma.booking.findMany({
    where: { hotelId: hotel.id, status: { in: ["confirmed", "in_house", "checked_out"] } },
    include: {
      guest: { select: { name: true } },
      channel: { select: { type: true } },
      roomType: { select: { name: true } },
    },
    orderBy: { checkIn: "asc" },
  });

  const t = STR[lang];
  const now = toIcalTimestamp(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//Stayboard//${escapeIcs(hotel.name)}//owner-feed//${lang.toUpperCase()}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(hotel.name)} · ${escapeIcs(t.description)}`,
    `X-WR-TIMEZONE:${escapeIcs(hotel.timezone)}`,
    `X-WR-CALDESC:${escapeIcs(t.description)}`,
    // Refresh hint — Apple Cal honors X-PUBLISHED-TTL; some clients use REFRESH-INTERVAL.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const b of bookings) {
    const channelLabel = b.channel?.type ?? "direct";
    const nights = Math.max(1, Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / 86_400_000));
    const summary = t.summary(b.guest.name, channelLabel);
    const descParts: string[] = [
      `${t.channel}: ${channelLabel}`,
      `${b.roomType.name} · ${nights} ${t.nights}`,
      `${t.total}: ₩${b.total.toLocaleString()}`,
    ];
    if (b.externalRef) descParts.push(`${t.ref}: ${b.externalRef}`);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:owner-${b.id}@stayboard`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;VALUE=DATE:${toIcalDate(b.checkIn)}`);
    lines.push(`DTEND;VALUE=DATE:${toIcalDate(b.checkOut)}`);
    lines.push(foldLine(`SUMMARY:${escapeIcs(summary)}`));
    lines.push(foldLine(`DESCRIPTION:${escapeIcs(descParts.join("\\n"))}`));
    lines.push(`STATUS:${b.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  // RFC 5545 requires CRLF
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename="${hotel.name.replace(/[^a-zA-Z0-9-]/g, "_")}-${lang}.ics"`,
    },
  });
}
