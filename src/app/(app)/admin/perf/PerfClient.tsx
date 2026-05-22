"use client";

import Link from "next/link";
import { useApp } from "@/lib/app-context";
import { I } from "@/components/icons";
import { SparklineChart } from "@/components/dashboard/SparklineChart";
import type { PerfOverview, SlowQueryRow } from "@/lib/queries";

function fmtRel(iso: string, lang: "ko" | "en" | "ja" | "zh"): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return lang === "ko" ? `${s}초 전` : `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return lang === "ko" ? `${m}분 전` : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return lang === "ko" ? `${h}시간 전` : `${h}h ago`;
  const d = Math.round(h / 24);
  return lang === "ko" ? `${d}일 전` : `${d}d ago`;
}

export function PerfClient({ overview }: { overview: PerfOverview }) {
  const { lang } = useApp();

  return (
    <div className="page">
      <div className="header">
        <Link href="/admin/hotels" className="back-link text-muted">
          <I.arrowL size={11} /> {lang === "ko" ? "관리" : "Admin"}
        </Link>
        <h1>{lang === "ko" ? "성능 — 슬로우 쿼리" : "Performance — slow queries"}</h1>
        <div className="sub text-muted">
          {lang === "ko"
            ? `${overview.thresholdMs}ms 초과 쿼리만 기록됩니다 · 환경변수 SLOW_QUERY_MS로 조정`
            : `Captures queries slower than ${overview.thresholdMs}ms · adjust via SLOW_QUERY_MS`}
        </div>
      </div>

      <section className="card">
        <div className="sec-h">
          <div>
            <div className="title">{lang === "ko" ? "지난 24시간" : "Last 24 hours"}</div>
            <div className="sub">{overview.total24h} {lang === "ko" ? "건의 슬로우 쿼리" : "slow queries"}</div>
          </div>
        </div>
        <div className="spark-wrap">
          <SparklineChart data={overview.hourlyBuckets} color="#dc2626" width={680} height={70} />
          <div className="spark-axis">
            <span>−24h</span>
            <span>−18h</span>
            <span>−12h</span>
            <span>−6h</span>
            <span>{lang === "ko" ? "지금" : "now"}</span>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="sec-h">
          <div className="title">{lang === "ko" ? "최악 10건 (24h)" : "Top 10 slowest (24h)"}</div>
        </div>
        <Table rows={overview.topSlowest24h} lang={lang} />
      </section>

      <section className="card">
        <div className="sec-h">
          <div className="title">{lang === "ko" ? "최근 50건" : "Recent 50"}</div>
        </div>
        <Table rows={overview.recent} lang={lang} />
      </section>

      <style>{`
        .page { padding: 20px 24px 32px; display: flex; flex-direction: column; gap: 16px; }
        .header h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin: 4px 0 2px; color: var(--t-1); }
        .back-link { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; text-decoration: none; }
        .header .sub { font-size: 12px; }
        .spark-wrap { padding: 8px 16px 16px; }
        .spark-axis { display: flex; justify-content: space-between; padding: 4px 4px 0; font-size: 10px; color: var(--t-4); }
      `}</style>
    </div>
  );
}

function Table({ rows, lang }: { rows: SlowQueryRow[]; lang: "ko" | "en" | "ja" | "zh" }) {
  if (rows.length === 0) {
    return (
      <div className="empty">
        {lang === "ko" ? "기록된 슬로우 쿼리 없음. (트래픽이 발생하면 여기에 채워집니다)" : "No slow queries recorded yet. (Traffic will populate this.)"}
        <style>{`.empty { padding: 32px; text-align: center; color: var(--t-3); font-size: 12px; }`}</style>
      </div>
    );
  }
  return (
    <table className="t-list">
      <thead>
        <tr>
          <th>{lang === "ko" ? "시각" : "When"}</th>
          <th className="r">{lang === "ko" ? "소요" : "Duration"}</th>
          <th>{lang === "ko" ? "쿼리" : "Query"}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={r.durationMs > 2000 ? "very-slow" : r.durationMs > 1000 ? "slow" : ""}>
            <td className="text-muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{fmtRel(r.occurredAt, lang)}</td>
            <td className="r num" style={{ fontWeight: 600 }}>{r.durationMs}ms</td>
            <td><code className="qcell">{r.query}</code></td>
          </tr>
        ))}
      </tbody>
      <style>{`
        .t-list { width: 100%; border-collapse: collapse; font-size: var(--fs-md); }
        .t-list th { font-weight: 500; color: var(--t-3); text-align: left; padding: 8px 16px; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.04em; background: var(--bg-1); border-bottom: 1px solid var(--bd-1);}
        .t-list th.r, .t-list td.r { text-align: right; }
        .t-list td { padding: 8px 16px; border-bottom: 1px solid var(--bd-1); color: var(--t-1); font-variant-numeric: tabular-nums; vertical-align: top; }
        .t-list tr:last-child td { border-bottom: 0;}
        .t-list tr.slow td { background: var(--warn-soft); }
        .t-list tr.very-slow td { background: var(--bad-soft); }
        .qcell { font-family: monospace; font-size: 10px; color: var(--t-2); white-space: pre-wrap; word-break: break-all; display: block; max-height: 60px; overflow: auto; }
      `}</style>
    </table>
  );
}
