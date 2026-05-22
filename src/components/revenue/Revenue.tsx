"use client";

import Link from "next/link";
import { I } from "../icons";
import { channelById, type ChannelId, type Lang } from "@/lib/i18n";
import type { RevenueData, RevenueRange } from "@/lib/queries";
import { RevenueBarChart } from "./RevenueBarChart";
import { RevparTrendChart } from "./RevparTrendChart";

const STACK_ORDER: ChannelId[] = ["airbnb", "booking", "agoda", "trip", "direct", "fb"];
const RANGE_LABEL: Record<RevenueRange, { ko: string; en: string }> = {
  "7d": { ko: "지난 7일", en: "Past 7d" },
  "30d": { ko: "지난 30일", en: "Past 30d" },
  "6M": { ko: "지난 6개월", en: "Past 6mo" },
  YTD: { ko: "올해 누계", en: "YTD" },
};

interface RevenueProps {
  lang?: Lang;
  data: RevenueData;
  range: RevenueRange;
}

export const Revenue = ({ lang = "ko", data, range }: RevenueProps) => {
  const ranges: RevenueRange[] = ["7d", "30d", "6M", "YTD"];
  const periodLabel = lang === "ko" ? RANGE_LABEL[range].ko : RANGE_LABEL[range].en;
  return (
    <div className="page">
      <div className="rev-tools">
        <div className="seg">
          {ranges.map((r) => (
            <Link
              key={r}
              href={`/revenue?range=${r}`}
              className={`seg-btn ${r === range ? "active" : ""}`}
              prefetch={false}
            >
              {r}
            </Link>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn sm ghost"><I.cal size={12} /> {lang === "ko" ? "비교: 전년" : "Compare: LY"}</button>
        <a
          className="btn sm ghost"
          href={`/api/revenue/tax-report?month=${(() => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - 1); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; })()}`}
          target="_blank"
          rel="noreferrer"
          title={lang === "ko" ? "지난달 세무 리포트 (PDF로 인쇄)" : "Last-month tax report (print to PDF)"}
        >
          <I.download size={12} /> {lang === "ko" ? "세무 리포트" : "Tax report"}
        </a>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-top"><span className="kpi-label tracker">{lang === "ko" ? "기간 수익" : "Revenue"}</span></div>
          <div className="kpi-val"><span className="num v">₩{(data.kpi.totalRev / 1_000_000).toFixed(1)}M</span></div>
          <div className="kpi-bot"><span className="kpi-sub text-muted">{periodLabel}</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><span className="kpi-label tracker">RevPAR</span></div>
          <div className="kpi-val"><span className="num v">₩{(data.kpi.revpar / 1000).toFixed(1)}K</span></div>
          <div className="kpi-bot"><span className="kpi-sub text-muted">{periodLabel}</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><span className="kpi-label tracker">ADR</span></div>
          <div className="kpi-val"><span className="num v">₩{(data.kpi.adr / 1000).toFixed(1)}K</span></div>
          <div className="kpi-bot"><span className="kpi-sub text-muted">{periodLabel}</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><span className="kpi-label tracker">{lang === "ko" ? "점유율" : "Occupancy"}</span></div>
          <div className="kpi-val"><span className="num v">{data.kpi.occupancy}%</span></div>
          <div className="kpi-bot"><span className="kpi-sub text-muted">{periodLabel}</span></div>
        </div>
      </div>

      <section className="card" style={{ marginTop: 12 }}>
        <div className="sec-h">
          <div>
            <div className="title">{lang === "ko" ? `채널별 수익 (${periodLabel})` : `Revenue by channel (${periodLabel})`}</div>
            <div className="sub">₩{(data.totalAll / 1_000_000).toFixed(1)}M {lang === "ko" ? "누적" : "total"}</div>
          </div>
          <div className="chart-legend">
            {STACK_ORDER.map((id) => {
              const ch = channelById(id)!;
              return (
                <span key={id} className="lg">
                  <span className={`dot ${ch.cls}`} />{ch.name}
                </span>
              );
            })}
          </div>
        </div>
        <div style={{ padding: "8px 16px 16px" }}>
          <RevenueBarChart monthly={data.monthly} lang={lang} />
        </div>
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <div className="sec-h">
          <div>
            <div className="title">{lang === "ko" ? "ADR · RevPAR (다음 14일)" : "ADR · RevPAR (next 14d)"}</div>
            <div className="sub">{lang === "ko" ? "예약 기준 일별 추이" : "Daily, booked-on-the-books"}</div>
          </div>
          <div className="chart-legend">
            <span className="lg"><span className="dot" style={{ background: "#4f46e5" }} />ADR</span>
            <span className="lg"><span className="dot" style={{ background: "#16a34a" }} />RevPAR</span>
          </div>
        </div>
        <RevparTrendChart points={data.dailyTrend} lang={lang} />
      </section>

      <div className="rev-grid">
        <section className="card">
          <div className="sec-h">
            <div className="title">{lang === "ko" ? "채널 수익성" : "Channel profitability"}</div>
            <div className="sub">{lang === "ko" ? "최근 30일" : "Last 30d"}</div>
          </div>
          {data.profitability.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--t-3)", fontSize: 13 }}>
              {lang === "ko" ? "데이터 없음" : "No data"}
            </div>
          ) : (
            <table className="t-list">
              <thead>
                <tr>
                  <th>{lang === "ko" ? "채널" : "Channel"}</th>
                  <th className="r">{lang === "ko" ? "수익" : "Revenue"}</th>
                  <th className="r">{lang === "ko" ? "수수료" : "Fees"}</th>
                  <th className="r">{lang === "ko" ? "실수령" : "Net"}</th>
                  <th className="r">{lang === "ko" ? "마진" : "Margin"}</th>
                </tr>
              </thead>
              <tbody>
                {data.profitability.map((r) => {
                  const ch = channelById(r.channel)!;
                  return (
                    <tr key={r.channel}>
                      <td><span className="mini-ch"><span className={`dot ${ch.cls}`} />{ch.name}</span></td>
                      <td className="r num">₩{(r.revenue / 1_000_000).toFixed(1)}M</td>
                      <td className="r num text-muted">−₩{(r.fee / 1_000_000).toFixed(2)}M</td>
                      <td className="r num" style={{ fontWeight: 600 }}>₩{(r.net / 1_000_000).toFixed(1)}M</td>
                      <td className="r"><span className={`pill ${r.margin === 100 ? "ok" : r.margin >= 85 ? "info" : "warn"}`}>{r.margin}%</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <div className="sec-h">
            <div className="title">{lang === "ko" ? "국가별 수익" : "Revenue by country"}</div>
            <div className="sub">{periodLabel}</div>
          </div>
          <div style={{ padding: 14 }}>
            {data.countries.length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", color: "var(--t-3)", fontSize: 13 }}>
                {lang === "ko" ? "데이터 없음" : "No data"}
              </div>
            ) : (
              data.countries.map((c) => (
                <div key={c.code} className="ctry-row">
                  <span className="flag" style={{ fontSize: 16 }}>{c.flag}</span>
                  <span style={{ flex: 1 }}>{lang === "ko" ? c.name.ko : c.name.en}</span>
                  <div className="ctry-bar"><div className="fill" style={{ width: `${Math.max(2, c.pct * 2.5)}%` }} /></div>
                  <span className="num text-muted" style={{ width: 36, textAlign: "right", fontSize: 11 }}>{c.pct}%</span>
                  <span className="num" style={{ width: 70, textAlign: "right", fontWeight: 500 }}>₩{(c.revenue / 1_000_000).toFixed(1)}M</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <style>{`
        .page { padding: 20px 24px 32px;}
        .rev-tools { display: flex; align-items: center; gap: 6px; padding-bottom: 12px;}
        .seg { display: inline-flex; gap: 2px; background: var(--bg-mute); border: 1px solid var(--bd-1); border-radius: var(--r-sm); padding: 2px;}
        .seg-btn { border: 0; background: transparent; padding: 4px 10px; height: 22px; font: inherit; font-size: var(--fs-xs); color: var(--t-2); border-radius: 4px; cursor: pointer; font-weight: 500; text-decoration: none; display: inline-flex; align-items: center;}
        .seg-btn.active { background: var(--bg); color: var(--t-1); box-shadow: var(--shadow-1);}
        .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;}
        .kpi { background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: var(--r-md); padding: 14px 16px 12px; min-height: 100px;}
        .kpi-top { display: flex; justify-content: space-between;}
        .kpi-label { color: var(--t-3);}
        .kpi-val { display: flex; align-items: baseline; gap: 4px; margin: 4px 0;}
        .kpi-val .v { font-size: 24px; font-weight: 600; color: var(--t-1); letter-spacing: -0.02em;}
        .kpi-bot { display: flex; align-items: center; gap: 8px;}
        .kpi-sub { font-size: var(--fs-xs);}

        .chart-legend { display: flex; gap: 12px; font-size: var(--fs-xs); color: var(--t-3); flex-wrap: wrap;}
        .chart-legend .lg { display: inline-flex; align-items: center; gap: 5px;}
        .chart-legend .dot { width: 8px; height: 8px; border-radius: 2px;}

        .bar-chart { display: grid; grid-template-columns: 50px 1fr; padding: 16px 24px 16px 8px; height: 280px;}
        .y-axis { display: flex; flex-direction: column; justify-content: space-between; padding-right: 8px;}
        .y-tick { font-size: 10px; color: var(--t-4); text-align: right; line-height: 1;}
        .bars { display: grid; grid-template-columns: repeat(6, 1fr); gap: 24px; padding: 0 12px;}
        .bar-col { display: flex; flex-direction: column; align-items: center; gap: 8px;}
        .bar-stack { width: 60%; flex: 1; display: flex; flex-direction: column-reverse; justify-content: flex-start; position: relative;}
        .bar-seg { width: 100%;}
        .bar-seg:first-of-type { border-radius: 4px 4px 0 0;}
        .total-lbl { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 4px; font-size: 11px; font-weight: 600; color: var(--t-2); white-space: nowrap;}
        .bar-x { font-size: var(--fs-xs); color: var(--t-3); font-weight: 500;}

        .rev-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 12px; margin-top: 12px;}
        .ctry-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; font-size: var(--fs-sm);}
        .ctry-bar { width: 100px; height: 6px; background: var(--bg-mute); border-radius: 999px; overflow: hidden;}
        .ctry-bar .fill { height: 100%; background: var(--acc); border-radius: 999px;}

        .mini-ch { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-xs); color: var(--t-2); font-weight: 500;}
        .mini-ch .dot { width: 7px; height: 7px; border-radius: 2px; flex: 0 0 7px;}
        .t-list { width: 100%; border-collapse: collapse; font-size: var(--fs-md);}
        .t-list th { font-weight: 500; color: var(--t-3); text-align: left; padding: 8px 16px; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.04em; background: var(--bg-1); border-bottom: 1px solid var(--bd-1);}
        .t-list th.r, .t-list td.r { text-align: right;}
        .t-list td { padding: 10px 16px; border-bottom: 1px solid var(--bd-1); color: var(--t-1); font-variant-numeric: tabular-nums;}
        .t-list tr:last-child td { border-bottom: 0;}
      `}</style>
    </div>
  );
};
