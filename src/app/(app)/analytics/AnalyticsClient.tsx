"use client";

import { useApp } from "@/lib/app-context";
import { I } from "@/components/icons";
import { channelById } from "@/lib/i18n";
import { SparklineChart } from "@/components/dashboard/SparklineChart";
import type { AnalyticsOverview, FunnelStep } from "@/lib/queries";

const FUNNEL_LABELS: Record<FunnelStep["key"], { ko: string; en: string }> = {
  created:     { ko: "예약 생성",  en: "Created" },
  confirmed:   { ko: "확정",       en: "Confirmed" },
  in_house:    { ko: "체크인",     en: "In-house" },
  checked_out: { ko: "체크아웃",   en: "Checked out" },
  reviewed:    { ko: "리뷰 요청",  en: "Review prompted" },
};

export function AnalyticsClient({ overview }: { overview: AnalyticsOverview }) {
  const { lang } = useApp();
  const funnelMax = overview.funnel[0]?.count || 1;

  return (
    <div className="page">
      <div className="header">
        <h1>{lang === "ko" ? "고급 분석" : "Advanced analytics"}</h1>
        <div className="sub text-muted">
          {lang === "ko"
            ? `${overview.windowStart} → ${overview.windowEnd} 기준 (지난 90일)`
            : `Window: ${overview.windowStart} → ${overview.windowEnd} (last 90 days)`}
        </div>
      </div>

      <div className="grid">
        {/* Funnel */}
        <section className="card span-7">
          <div className="sec-h">
            <div>
              <div className="title">{lang === "ko" ? "예약 퍼널" : "Booking funnel"}</div>
              <div className="sub">
                {lang === "ko"
                  ? `${overview.funnel[0]?.count ?? 0}건 시작 · 최종 ${overview.funnel.at(-1)?.count ?? 0}건`
                  : `${overview.funnel[0]?.count ?? 0} entered · ${overview.funnel.at(-1)?.count ?? 0} reviewed`}
              </div>
            </div>
          </div>
          <div className="funnel-body">
            {overview.funnel.map((step, i) => {
              const widthPct = funnelMax > 0 ? Math.max(4, (step.count / funnelMax) * 100) : 0;
              const label = lang === "ko" ? FUNNEL_LABELS[step.key].ko : FUNNEL_LABELS[step.key].en;
              const dropPct = i > 0 ? Math.round((1 - step.convFromPrev) * 100) : 0;
              return (
                <div key={step.key} className="funnel-row">
                  <div className="fr-label">{label}</div>
                  <div className="fr-bar">
                    <div className="fr-fill" style={{ width: `${widthPct}%` }}>
                      <span className="fr-count num">{step.count.toLocaleString()}</span>
                    </div>
                    {i > 0 && step.convFromPrev < 1 && dropPct > 0 && (
                      <span className="fr-drop">−{dropPct}%</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Channel attribution */}
        <section className="card span-5">
          <div className="sec-h">
            <div className="title">{lang === "ko" ? "채널 기여도" : "Channel attribution"}</div>
            <div className="sub">{overview.attribution.length} {lang === "ko" ? "채널" : "channels"}</div>
          </div>
          {overview.attribution.length === 0 ? (
            <div className="empty">{lang === "ko" ? "데이터 없음" : "No data"}</div>
          ) : (
            <table className="t-list">
              <thead>
                <tr>
                  <th>{lang === "ko" ? "채널" : "Channel"}</th>
                  <th className="r">{lang === "ko" ? "예약" : "Bookings"}</th>
                  <th className="r">{lang === "ko" ? "매출" : "Revenue"}</th>
                  <th className="r">%</th>
                </tr>
              </thead>
              <tbody>
                {overview.attribution.map((c) => {
                  const ch = channelById(c.channel);
                  return (
                    <tr key={c.channel}>
                      <td>
                        <span className="mini-ch"><span className={`dot ${ch?.cls}`} />{ch?.name ?? c.channel}</span>
                      </td>
                      <td className="r num">{c.bookingsCount}</td>
                      <td className="r num" style={{ fontWeight: 600 }}>₩{(c.revenue / 1_000_000).toFixed(1)}M</td>
                      <td className="r num">{Math.round(c.share * 100)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* Cohort retention */}
        <section className="card span-12">
          <div className="sec-h">
            <div>
              <div className="title">{lang === "ko" ? "코호트 리텐션" : "Cohort retention"}</div>
              <div className="sub">
                {lang === "ko"
                  ? "월별 첫 투숙 기준 — 이후 N개월 내 재투숙 비율"
                  : "By first-stay month — share of guests returning N months later"}
              </div>
            </div>
          </div>
          {overview.cohorts.length === 0 ? (
            <div className="empty">{lang === "ko" ? "데이터 부족 (최소 1개월 필요)" : "Not enough data (need ≥1 month)"}</div>
          ) : (
            <div className="cohort-wrap">
              <table className="cohort-table">
                <thead>
                  <tr>
                    <th>{lang === "ko" ? "코호트" : "Cohort"}</th>
                    <th className="r">N</th>
                    {[0, 1, 2, 3, 4, 5].map((m) => (
                      <th key={m} className="r">M+{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {overview.cohorts.map((c) => (
                    <tr key={c.cohort}>
                      <td className="mono">{c.cohort}</td>
                      <td className="r num">{c.size}</td>
                      {c.retention.map((r, i) => {
                        const pct = Math.round(r * 100);
                        const intensity = Math.min(1, r);
                        const bg = `rgba(79, 70, 229, ${0.05 + intensity * 0.5})`;
                        return (
                          <td key={i} className="r" style={{ background: bg, fontWeight: pct > 0 ? 500 : 400 }}>
                            {pct === 100 ? "—" : pct > 0 ? `${pct}%` : ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Forecast */}
        <section className="card span-12">
          <div className="sec-h">
            <div>
              <div className="title">{lang === "ko" ? "30일 매출 예측" : "30-day revenue forecast"}</div>
              <div className="sub">
                {lang === "ko"
                  ? `요일 평균 + 이벤트 보정 · 합계 ₩${(overview.forecast30dRevenue / 1_000_000).toFixed(1)}M`
                  : `Day-of-week avg + event lift · total ₩${(overview.forecast30dRevenue / 1_000_000).toFixed(1)}M`}
              </div>
            </div>
            <span className="pill info" style={{ fontSize: 10 }}>
              <I.sparkle size={9} /> Heuristic
            </span>
          </div>
          <div className="forecast-charts">
            <ChartTile
              label={lang === "ko" ? "RevPAR 예측" : "RevPAR forecast"}
              points={overview.forecast.map((p) => p.revpar)}
              color="#4f46e5"
              suffix=""
              prefix="₩"
            />
            <ChartTile
              label={lang === "ko" ? "점유율 예측" : "Occupancy forecast"}
              points={overview.forecast.map((p) => Math.round(p.occupancy * 100))}
              color="#16a34a"
              suffix="%"
            />
            <ChartTile
              label={lang === "ko" ? "ADR 예측" : "ADR forecast"}
              points={overview.forecast.map((p) => p.adr)}
              color="#ea580c"
              suffix=""
              prefix="₩"
            />
          </div>
          <div className="event-list">
            {overview.forecast.filter((p) => p.event).slice(0, 8).map((p) => (
              <div key={p.iso} className="ev-row">
                <span className="text-muted mono">{p.iso}</span>
                <span className="ev-name">{p.event}</span>
                <span className="num">₩{(p.revpar / 1000).toFixed(0)}K RevPAR</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <style>{`
        .page { padding: 20px 24px 32px; display: flex; flex-direction: column; gap: 16px; }
        .header h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 2px; color: var(--t-1); }
        .header .sub { font-size: 12px; }
        .grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 12px; }
        .span-7 { grid-column: span 7; }
        .span-5 { grid-column: span 5; }
        .span-12 { grid-column: span 12; }
        .empty { padding: 32px; text-align: center; color: var(--t-3); font-size: 12px; }

        .funnel-body { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 10px; }
        .funnel-row { display: grid; grid-template-columns: 110px 1fr; gap: 12px; align-items: center; }
        .fr-label { font-size: 12px; color: var(--t-2); font-weight: 500; }
        .fr-bar { display: flex; align-items: center; gap: 8px; height: 32px; }
        .fr-fill {
          background: linear-gradient(90deg, var(--acc), #818cf8);
          height: 100%; border-radius: 4px; display: flex; align-items: center;
          padding: 0 10px; min-width: 60px; transition: width .25s;
        }
        .fr-count { color: white; font-weight: 600; font-size: 13px; }
        .fr-drop { font-size: 10px; color: var(--bad); font-weight: 600; padding: 2px 6px; background: var(--bad-soft); border-radius: 4px; }

        .t-list { width: 100%; border-collapse: collapse; font-size: var(--fs-md); }
        .t-list th { font-weight: 500; color: var(--t-3); text-align: left; padding: 8px 16px; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.04em; background: var(--bg-1); border-bottom: 1px solid var(--bd-1);}
        .t-list th.r, .t-list td.r { text-align: right; }
        .t-list td { padding: 10px 16px; border-bottom: 1px solid var(--bd-1); color: var(--t-1); font-variant-numeric: tabular-nums;}
        .t-list tr:last-child td { border-bottom: 0;}
        .mini-ch { display: inline-flex; align-items: center; gap: 5px; }
        .mini-ch .dot { width: 7px; height: 7px; border-radius: 2px; flex: 0 0 7px; }

        .cohort-wrap { padding: 12px 16px 16px; overflow-x: auto; }
        .cohort-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 11px; }
        .cohort-table th { text-align: left; padding: 6px 10px; color: var(--t-3); font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500; border-bottom: 1px solid var(--bd-1);}
        .cohort-table th.r, .cohort-table td.r { text-align: right; }
        .cohort-table td { padding: 6px 10px; border-bottom: 1px solid var(--bd-1); color: var(--t-1); font-variant-numeric: tabular-nums; }
        .cohort-table tr:last-child td { border-bottom: 0; }
        .mono { font-family: monospace; }

        .forecast-charts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 12px 16px; }
        .event-list { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 4px; }
        .ev-row { display: grid; grid-template-columns: 90px 1fr 110px; gap: 8px; align-items: center; padding: 6px 8px; border-radius: 4px; font-size: 11px; }
        .ev-row:hover { background: var(--bg-1); }
        .ev-row .ev-name { font-weight: 500; color: var(--t-1); }
        .pill { padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; display: inline-flex; align-items: center; gap: 4px; }
        .pill.info { background: var(--acc-soft); color: var(--acc); }
      `}</style>
    </div>
  );
}

function ChartTile({ label, points, color, prefix = "", suffix = "" }: { label: string; points: number[]; color: string; prefix?: string; suffix?: string }) {
  const last = points.at(-1) ?? 0;
  const first = points[0] ?? 0;
  const delta = first === 0 ? 0 : Math.round(((last - first) / first) * 100);
  return (
    <div className="ct">
      <div className="ct-h">
        <span className="ct-lbl">{label}</span>
        <span className={`ct-delta ${delta >= 0 ? "up" : "down"}`}>
          {delta >= 0 ? "+" : ""}{delta}%
        </span>
      </div>
      <div className="ct-val num">{prefix}{Math.round(last).toLocaleString()}{suffix}</div>
      <SparklineChart data={points} color={color} width={220} height={48} />
      <style>{`
        .ct { background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 4px; }
        .ct-h { display: flex; justify-content: space-between; align-items: center; }
        .ct-lbl { font-size: 11px; color: var(--t-3); font-weight: 500; }
        .ct-delta { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 999px; }
        .ct-delta.up { background: var(--ok-soft); color: var(--ok); }
        .ct-delta.down { background: var(--bad-soft); color: var(--bad); }
        .ct-val { font-size: 18px; font-weight: 700; color: var(--t-1); margin-bottom: 4px; }
      `}</style>
    </div>
  );
}
