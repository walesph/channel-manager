import { buildTaxReport } from "@/lib/queries";
import { channelById } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Monthly tax / accounting report.
 *
 * Returns a print-ready HTML document — open in a browser, then File → Print
 * → "Save as PDF". This is the lightest path: zero PDF-rendering deps in the
 * server bundle, and accountants are happy with PDF-from-print since it
 * preserves selectable text + KO fonts perfectly.
 *
 * Query params:
 *   month=YYYY-MM   required, defaults to last full month
 *   download=1      adds Content-Disposition so the browser downloads instead of showing
 */

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lastFullMonth(): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const month = url.searchParams.get("month") || lastFullMonth();
  const wantsDownload = url.searchParams.get("download") === "1";

  const report = await buildTaxReport(month);
  if (!report) {
    return new Response("Invalid or empty month (use YYYY-MM)", { status: 400 });
  }

  const fmt = (n: number) => `₩${n.toLocaleString()}`;

  const rows = report.bookings.map((b) => {
    const ch = channelById(b.channel);
    return `<tr>
      <td class="mono">${escape(b.checkOut)}</td>
      <td>${escape(b.guestName)}${b.guestCountry ? ` <span class="muted">(${escape(b.guestCountry)})</span>` : ""}</td>
      <td class="mono small">${escape(b.externalRef ?? "—")}</td>
      <td>${escape(ch?.name ?? b.channel)}</td>
      <td>${escape(b.roomType)}</td>
      <td class="r num">${b.nights}</td>
      <td class="r num">${fmt(b.total)}</td>
      <td class="r num muted">−${fmt(b.commission)}</td>
      <td class="r num strong">${fmt(b.net)}</td>
    </tr>`;
  }).join("");

  const channelRows = report.totals.byChannel.map((c) => {
    const ch = channelById(c.channel);
    return `<tr>
      <td>${escape(ch?.name ?? c.channel)}</td>
      <td class="r num">${c.bookings}</td>
      <td class="r num">${fmt(c.gross)}</td>
      <td class="r num muted">−${fmt(c.commission)}</td>
      <td class="r num strong">${fmt(c.net)}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>Tax report ${escape(report.ym)} — ${escape(report.hotel.name)}</title>
<style>
  body { font: 12px/1.5 -apple-system, "Helvetica Neue", "Apple SD Gothic Neo", sans-serif; color: #111; padding: 32px; max-width: 980px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 2px solid #111; }
  h1 { font-size: 22px; margin: 0 0 4px; font-weight: 700; }
  .meta { color: #555; font-size: 11px; }
  .logo { width: 56px; height: 56px; border-radius: 8px; background: #f5f5f5; display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 700; color: #888; overflow: hidden; }
  .logo img { width: 100%; height: 100%; object-fit: cover; }
  .totals-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 18px 0; }
  .tile { padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; }
  .tile .lbl { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; }
  .tile .val { font-size: 18px; font-weight: 700; margin-top: 2px; }
  h2 { font-size: 14px; margin: 18px 0 6px; font-weight: 600; padding-bottom: 4px; border-bottom: 1px solid #ddd; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { text-align: left; font-weight: 600; padding: 6px 8px; background: #f8f8f8; border-bottom: 1px solid #ddd; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; }
  tr:last-child td { border-bottom: 0; }
  .r { text-align: right; }
  .num { font-variant-numeric: tabular-nums; }
  .muted { color: #777; }
  .strong { font-weight: 600; }
  .small { font-size: 10px; }
  .mono { font-family: "SF Mono", Menlo, Consolas, monospace; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 10px; color: #777; }
  @media print {
    body { padding: 0; }
    .no-print { display: none; }
    table { font-size: 10px; }
    h2 { break-before: page; break-after: avoid; }
    h2:first-of-type { break-before: auto; }
    tr { break-inside: avoid; }
  }
</style>
</head>
<body>
  <header>
    <div>
      <h1>${escape(report.hotel.name)}</h1>
      <div class="meta">
        세무 / 매출 보고서 · Tax / revenue report<br>
        Period: ${escape(report.rangeStart)} → ${escape(report.rangeEnd)}<br>
        Generated: ${escape(report.generatedAt)}
      </div>
    </div>
    <div class="logo">
      ${report.hotel.logoUrl
        ? `<img src="${escape(report.hotel.logoUrl)}" alt="logo" />`
        : escape(report.hotel.name.slice(0, 1).toUpperCase())}
    </div>
  </header>

  <div class="totals-grid">
    <div class="tile"><div class="lbl">예약 / Bookings</div><div class="val">${report.totals.bookings}</div></div>
    <div class="tile"><div class="lbl">박수 / Nights</div><div class="val">${report.totals.nights}</div></div>
    <div class="tile"><div class="lbl">총매출 / Gross</div><div class="val">${fmt(report.totals.gross)}</div></div>
    <div class="tile"><div class="lbl">실수령 / Net</div><div class="val">${fmt(report.totals.net)}</div></div>
  </div>

  <h2>채널별 / By channel</h2>
  <table>
    <thead><tr>
      <th>Channel</th>
      <th class="r">Bookings</th>
      <th class="r">Gross</th>
      <th class="r">Commission</th>
      <th class="r">Net</th>
    </tr></thead>
    <tbody>${channelRows || `<tr><td colspan="5" class="muted" style="text-align:center;padding:20px">데이터 없음 · No data</td></tr>`}</tbody>
  </table>

  <h2>예약 상세 / Booking details (${report.totals.bookings})</h2>
  <table>
    <thead><tr>
      <th>Check-out</th>
      <th>Guest</th>
      <th>Ref</th>
      <th>Channel</th>
      <th>Room type</th>
      <th class="r">Nights</th>
      <th class="r">Gross</th>
      <th class="r">Commission</th>
      <th class="r">Net</th>
    </tr></thead>
    <tbody>${rows || `<tr><td colspan="9" class="muted" style="text-align:center;padding:20px">데이터 없음 · No bookings checked out this month</td></tr>`}</tbody>
  </table>

  <div class="footer">
    Generated by Stayboard · This document is for accounting purposes. Commission rates are estimates based on
    standard OTA agreements and may differ from your actual contracted rates. Verify against OTA invoices before filing.
    <br><br>
    <button class="no-print" onclick="window.print()" style="padding:6px 14px;border:1px solid #111;background:#111;color:#fff;border-radius:4px;cursor:pointer;font:inherit">Save as PDF (Print)</button>
  </div>
</body>
</html>`;

  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (wantsDownload) {
    const fname = `tax-${report.hotel.name.replace(/[^a-zA-Z0-9-]/g, "_")}-${report.ym}.html`;
    headers["Content-Disposition"] = `attachment; filename="${fname}"`;
  }
  return new Response(html, { headers });
}
