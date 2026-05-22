import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 0;

interface Params {
  token: string;
}

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

export async function GET(_req: Request, ctx: { params: Promise<Params> }) {
  const { token } = await ctx.params;
  const cleaned = token.replace(/\.ics$/i, "");

  const channel = await prisma.channel.findUnique({
    where: { icalExportToken: cleaned },
    include: { hotel: { select: { name: true, timezone: true } } },
  });
  if (!channel) {
    return new Response("Not found", { status: 404 });
  }

  const bookings = await prisma.booking.findMany({
    where: {
      channelId: channel.id,
      status: { in: ["confirmed", "in_house", "checked_out"] },
    },
    include: { guest: { select: { name: true } }, roomType: { select: { name: true } } },
    orderBy: { checkIn: "asc" },
  });

  const now = toIcalTimestamp(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//Stayboard//${escapeIcs(channel.hotel.name)}//${escapeIcs(channel.type)}//KO`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(channel.hotel.name)} · ${escapeIcs(channel.type)}`,
    `X-WR-TIMEZONE:${escapeIcs(channel.hotel.timezone)}`,
  ];

  for (const b of bookings) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:stayboard-${b.id}@${channel.id}`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${toIcalDate(b.checkIn)}`,
      `DTEND;VALUE=DATE:${toIcalDate(b.checkOut)}`,
      `SUMMARY:${escapeIcs(`${b.roomType.name} · ${b.guest.name}`)}`,
      `DESCRIPTION:${escapeIcs(`${channel.type} · ${b.externalRef ?? b.id} · ₩${b.total.toLocaleString()} · ${b.status}`)}`,
      `STATUS:${b.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
      `TRANSP:${b.status === "cancelled" ? "TRANSPARENT" : "OPAQUE"}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  // RFC 5545 mandates CRLF line endings
  const body = lines.join("\r\n") + "\r\n";

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Content-Disposition": `inline; filename="stayboard-${channel.type}.ics"`,
    },
  });
}
