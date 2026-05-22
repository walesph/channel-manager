"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { I } from "../icons";
import { STR, channelById, type ChannelId, type Lang } from "@/lib/i18n";
import type { ActivityItem, AiRecommendationSummary, ArrivalRow, BookingWarningAction, BookingWarningSummaryItem, ChannelMixRow, DashboardKpis, OccupancyTrendPoint, UpcomingEventItem } from "@/lib/queries";
import { applyRateRecommendation, sendMessage, setBookingStatus } from "@/lib/actions";
import { SparklineChart } from "./SparklineChart";
import { OccupancyTrend } from "./OccupancyTrend";

interface SparklineProps {
  data: number[];
  w?: number;
  h?: number;
  color?: string;
  fill?: boolean;
}

const Sparkline = ({ data, w = 80, h = 26, color = "#4f46e5" }: SparklineProps) => (
  <SparklineChart data={data} color={color} width={w} height={h} />
);

interface KPIProps {
  label: string;
  value: string;
  unit?: string;
  delta: number;
  deltaLabel: string;
  spark?: number[];
  sparkColor?: string;
  accent?: string;
}

const KPI = ({ label, value, unit, delta, deltaLabel, spark, sparkColor, accent }: KPIProps) => (
  <div className="kpi">
    <div className="kpi-top">
      <span className="kpi-label tracker">{label}</span>
      <button className="btn ghost icon" style={{ height: 22, width: 22 }}>
        <I.more size={13} />
      </button>
    </div>
    <div className="kpi-val">
      <span className="num v">{value}</span>
      {unit && <span className="u">{unit}</span>}
    </div>
    <div className="kpi-bot">
      <span className={`delta ${delta >= 0 ? "up" : "down"}`}>
        {delta >= 0 ? <I.arrowU size={11} /> : <I.arrowD size={11} />}
        <span className="num">{Math.abs(delta)}%</span>
      </span>
      <span className="kpi-sub text-muted">{deltaLabel}</span>
      <div style={{ flex: 1 }} />
      {spark && <Sparkline data={spark} color={sparkColor || "var(--acc)"} w={80} h={26} />}
    </div>
    {accent && <div className="accent-bar" style={{ background: accent }} />}
    <style>{`
      .kpi {
        position: relative;
        background: var(--bg-elev); border: 1px solid var(--bd-1);
        border-radius: var(--r-md); padding: 14px 16px 12px;
        display: flex; flex-direction: column; gap: 6px;
        min-height: 112px;
        overflow: hidden;
      }
      .kpi-top { display: flex; align-items: center; justify-content: space-between; }
      .kpi-label { color: var(--t-3); }
      .kpi-val { display: flex; align-items: baseline; gap: 4px; margin: 2px 0; }
      .kpi-val .v { font-size: 26px; font-weight: 600; letter-spacing: -0.02em; color: var(--t-1); }
      .kpi-val .u { font-size: var(--fs-md); color: var(--t-3); font-weight: 500; }
      .kpi-bot { display: flex; align-items: center; gap: 8px; }
      .delta { display: inline-flex; align-items: center; gap: 2px; font-size: var(--fs-xs); font-weight: 500; padding: 2px 6px; border-radius: 4px; }
      .delta.up   { color: var(--ok); background: var(--ok-soft); }
      .delta.down { color: var(--bad); background: var(--bad-soft); }
      .kpi-sub { font-size: var(--fs-xs); }
      .accent-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 2px; }
    `}</style>
  </div>
);

interface DashboardProps {
  lang?: Lang;
  arrivals: ArrivalRow[];
  recommendations: AiRecommendationSummary;
  occupancyTrend: OccupancyTrendPoint[];
  channelMix: ChannelMixRow[];
  kpis: DashboardKpis;
  issueActivity: ActivityItem[];
  warningSummary: BookingWarningSummaryItem[];
  upcomingEvents: UpcomingEventItem[];
}

interface Issue {
  type: "bad" | "warn" | "info";
  ch: ChannelId;
  title: string;
  sub: string;
  href?: string;
  /** When set, the issue renders an inline action button before the chevron. */
  warningAction?: {
    bookingId: string;
    threadId: string | null;
    guestName: string;
    checkInIso: string;
    kind: BookingWarningAction;
    actionLabel: string;
    /** Stable key for pending/saved state. */
    key: string;
  };
}

export const Dashboard = ({ lang = "ko", arrivals, recommendations, occupancyTrend, channelMix: channelMixDb, kpis, issueActivity, warningSummary, upcomingEvents }: DashboardProps) => {
  const t = STR[lang];
  const router = useRouter();
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [warnPendingKey, setWarnPendingKey] = useState<string | null>(null);
  const [warnDoneKeys, setWarnDoneKeys] = useState<Set<string>>(new Set());
  const [expandedExplain, setExpandedExplain] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleWarningAction = (a: NonNullable<Issue["warningAction"]>) => {
    if (!a.kind) return;
    if (warnPendingKey || warnDoneKeys.has(a.key)) return;
    setWarnPendingKey(a.key);
    startTransition(async () => {
      try {
        if (a.kind === "mark_paid") {
          await setBookingStatus(a.bookingId, "mark_paid");
        } else if (a.kind === "mark_refunded") {
          await setBookingStatus(a.bookingId, "mark_refunded");
        } else if (a.kind === "send_reminder" && a.threadId) {
          const reminder = lang === "ko"
            ? `안녕하세요 ${a.guestName}님, 곧 체크인 일정입니다 (${a.checkInIso}). 결제가 아직 완료되지 않아 안내드립니다. 감사합니다.`
            : `Hi ${a.guestName}, your check-in is coming up (${a.checkInIso}). We noticed your payment is still pending — please complete it at your earliest convenience. Thank you.`;
          await sendMessage(a.threadId, reminder);
        }
        setWarnDoneKeys((prev) => new Set(prev).add(a.key));
        router.refresh();
      } finally {
        setWarnPendingKey(null);
      }
    });
  };

  const applyOne = (rec: { roomTypeId: string; date: string; suggestedRate: number }) => {
    const key = `${rec.roomTypeId}:${rec.date}`;
    setPendingId(key);
    startTransition(async () => {
      const r = await applyRateRecommendation(rec.roomTypeId, rec.date, rec.suggestedRate);
      setPendingId(null);
      if (r.ok) {
        setAppliedIds((prev) => new Set(prev).add(key));
        router.refresh();
      }
    });
  };

  const applyAll = () => {
    setPendingId("__all__");
    startTransition(async () => {
      for (const rec of recommendations.recs) {
        await applyRateRecommendation(rec.roomTypeId, rec.date, rec.suggestedRate);
      }
      setPendingId(null);
      setAppliedIds(new Set(recommendations.recs.map((r) => `${r.roomTypeId}:${r.date}`)));
      router.refresh();
    });
  };

  // KPIs from real DB; fall back to small synthetic numbers when DB returns 0 so charts aren't flat
  const occSpark = kpis.occupancy.spark;
  const revSpark = kpis.revpar.spark;
  const adrSpark = kpis.adr.spark;
  const bookSpark = kpis.bookings.spark;

  // Build issues from booking warnings (high priority) + ActivityFeed (sync warnings + messages)
  const warningIssues: Issue[] = warningSummary.map((w) => {
    const canAct = w.action === "mark_paid"
      || w.action === "mark_refunded"
      || (w.action === "send_reminder" && !!w.threadId);
    return {
      type: w.severity,
      ch: w.channel,
      title: `${w.guestName} · ${w.label}`,
      sub: w.bookingRef ?? "",
      href: "/bookings",
      warningAction: canAct && w.action && w.actionLabel
        ? {
            bookingId: w.bookingId,
            threadId: w.threadId,
            guestName: w.guestName,
            checkInIso: w.checkInIso,
            kind: w.action,
            actionLabel: w.actionLabel,
            key: `${w.bookingId}:${w.kind}`,
          }
        : undefined,
    };
  });
  const activityIssues: Issue[] = issueActivity.map((a) => ({
    type: a.kind === "sync_log" ? "warn" : a.kind === "message" ? "info" : "bad",
    ch: (a.channel ?? "direct") as ChannelId,
    title: a.title,
    sub: a.sub ?? "",
    href: a.href,
  }));
  const issues: Issue[] = [...warningIssues, ...activityIssues].slice(0, 4);
  // Augment with the most actionable AI rec when there's room left
  if (issues.length < 4 && recommendations.recs.length > 0) {
    const top = [...recommendations.recs].sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))[0];
    issues.push({
      type: "info",
      ch: top.topChannel,
      title: lang === "ko"
        ? `AI: ${top.roomTypeName} 가격 ${top.deltaPct > 0 ? "인상" : "조정"} 추천 (${top.deltaPct}%)`
        : `AI: ${top.roomTypeName} ${top.deltaPct > 0 ? "raise" : "adjust"} ${top.deltaPct}%`,
      sub: top.reason,
      href: `/calendar?start=${top.date}`,
    });
  }

  const channelMix = channelMixDb.map((m) => ({ id: m.id, pct: m.pct, rev: m.revenue, count: m.bookings }));
  const channelMixTotalRev = channelMixDb.reduce((s, m) => s + m.revenue, 0);
  const channelMixTotalCount = channelMixDb.reduce((s, m) => s + m.bookings, 0);

  const exportSnapshot = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const sections: string[] = [];
    const escape = (v: unknown) => {
      const s = (v ?? "").toString();
      return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    sections.push("# Today's arrivals");
    sections.push(["Guest", "Channel", "Nights", "Total", "Country"].join(","));
    for (const a of arrivals) {
      sections.push([a.name, a.channel, a.nights, a.total, a.flag].map(escape).join(","));
    }

    sections.push("");
    sections.push("# Channel mix (MTD)");
    sections.push(["Channel", "Pct", "Revenue", "Bookings"].join(","));
    for (const m of channelMix) {
      sections.push([m.id, `${m.pct}%`, m.rev, m.count].map(escape).join(","));
    }

    sections.push("");
    sections.push("# AI rate recommendations");
    sections.push(["Date", "RoomType", "Channel", "CurrentRate", "SuggestedRate", "DeltaPct", "CompAvg", "Event", "Reason"].join(","));
    for (const r of recommendations.recs) {
      sections.push([r.date, r.roomTypeName, r.topChannel, r.currentRate, r.suggestedRate, `${r.deltaPct}%`, r.compAvg, r.event ?? "", r.reason].map(escape).join(","));
    }

    sections.push("");
    sections.push("# Occupancy + revenue trend");
    sections.push(["Date", "Occupancy%", "Revenue"].join(","));
    for (const p of occupancyTrend) {
      sections.push([p.date, p.pct, p.revenue].map(escape).join(","));
    }

    const blob = new Blob(["﻿" + sections.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dashboard-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatDay = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    const m = d.getUTCMonth() + 1;
    const dom = d.getUTCDate();
    const dow = d.getUTCDay();
    const dowKo = ["일", "월", "화", "수", "목", "금", "토"][dow];
    const dowEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow];
    return lang === "ko" ? `${m}월 ${dom}일 (${dowKo})` : `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()]} ${dom} (${dowEn})`;
  };

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          className="btn sm ghost"
          onClick={exportSnapshot}
          title={lang === "ko" ? "일일 스냅샷 CSV" : "Daily snapshot CSV"}
        >
          <I.download size={12} /> {lang === "ko" ? "스냅샷 내보내기" : "Export snapshot"}
        </button>
      </div>
      <div className="kpi-row">
        <KPI label={t.occupancy} value={`${kpis.occupancy.current}`} unit="%" delta={kpis.occupancy.delta} deltaLabel={lang === "ko" ? "전주 대비" : "vs last week"} spark={occSpark} sparkColor="#16a34a" accent="var(--ok)" />
        <KPI label={t.adr} value={`₩${kpis.adr.current.toLocaleString()}`} delta={kpis.adr.delta} deltaLabel={lang === "ko" ? "전주 대비" : "vs last week"} spark={adrSpark} sparkColor="#4f46e5" accent="var(--acc)" />
        <KPI label={t.revpar} value={`₩${kpis.revpar.current.toLocaleString()}`} delta={kpis.revpar.delta} deltaLabel={lang === "ko" ? "전주 대비" : "vs last week"} spark={revSpark} sparkColor="#0284c7" accent="var(--info)" />
        <KPI label={t.bookings} value={`${kpis.bookings.current}`} unit={lang === "ko" ? "건" : "today"} delta={kpis.bookings.delta} deltaLabel={lang === "ko" ? "어제 대비" : "vs yesterday"} spark={bookSpark} sparkColor="#ea580c" accent="var(--warn)" />
      </div>

      <section className="card">
        <div className="sec-h">
          <div>
            <div className="title">{lang === "ko" ? "점유율 + 수익 추이 (다음 14일)" : "Occupancy + revenue (next 14d)"}</div>
            <div className="sub">{lang === "ko" ? "확정 + 재실 예약, 박당 비례 분배" : "Confirmed + in-house, prorated per night"}</div>
          </div>
          <div className="chart-legend" style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--t-3)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "#4f46e5" }} />
              {lang === "ko" ? "점유율" : "Occupancy"}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "#16a34a" }} />
              {lang === "ko" ? "수익" : "Revenue"}
            </span>
          </div>
        </div>
        <OccupancyTrend points={occupancyTrend} lang={lang} />
      </section>

      {upcomingEvents.length > 0 && (
        <section className="card events-strip">
          <div className="sec-h">
            <div>
              <div className="title">{lang === "ko" ? "다가오는 이벤트" : "Upcoming events"}</div>
              <div className="sub">{lang === "ko" ? `다음 30일 — ${upcomingEvents.length}건` : `Next 30 days — ${upcomingEvents.length}`}</div>
            </div>
          </div>
          <div className="events-list">
            {upcomingEvents.slice(0, 8).map((e) => {
              const cls =
                e.category === "public_holiday" ? "ev-holiday"
                : e.category === "concert_event" ? "ev-concert"
                : e.category === "school_break" ? "ev-school"
                : "ev-shopping";
              return (
                <div key={`${e.date}-${e.label}`} className={`ev-chip ${cls}`} title={`${e.date} · ${(e.multiplier * 100 - 100).toFixed(0)}% 가격 영향`}>
                  <div className="ev-day">
                    {e.daysAway === 0
                      ? lang === "ko" ? "오늘" : "Today"
                      : e.daysAway === 1
                      ? lang === "ko" ? "내일" : "Tomorrow"
                      : `+${e.daysAway}${lang === "ko" ? "일" : "d"}`}
                  </div>
                  <div className="ev-label">{e.label}</div>
                  {e.multiplier > 1.0 && (
                    <div className="ev-mult">+{Math.round((e.multiplier - 1) * 100)}%</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="dash-grid">
        <section className="card span-7">
          <div className="sec-h">
            <div>
              <div className="title">{lang === "ko" ? "주의 필요" : "Needs attention"}</div>
              <div className="sub">{lang === "ko" ? `${issues.length}건의 이슈와 추천` : `${issues.length} issues and suggestions`}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn sm ghost">
                <I.filter size={12} /> {lang === "ko" ? "필터" : "Filter"}
              </button>
              <button className="btn sm">{lang === "ko" ? "전체 보기" : "View all"}</button>
            </div>
          </div>
          <div className="issues">
            {issues.map((it, i) => {
              const ch = channelById(it.ch);
              const Container = it.href ? "a" : "div";
              const wa = it.warningAction;
              const isPending = wa ? warnPendingKey === wa.key : false;
              const isDone = wa ? warnDoneKeys.has(wa.key) : false;
              return (
                <Container
                  key={i}
                  className={`issue ${it.type} ${it.href ? "linked" : ""}`}
                  href={it.href}
                >
                  <div className="ic">
                    {it.type === "bad" && <I.warn size={14} />}
                    {it.type === "warn" && <I.warn size={14} />}
                    {it.type === "info" && <I.sparkle size={14} />}
                  </div>
                  <div className="body">
                    <div className="t">{it.title}</div>
                    <div className="s">
                      <span className="mini-ch">
                        <span className={`dot ${ch?.cls}`} />
                        {ch?.name}
                      </span>
                      {it.sub && (
                        <>
                          <span className="text-muted">·</span>
                          <span>{it.sub}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="actions">
                    {wa && (
                      <button
                        type="button"
                        className={`btn xs ${isDone ? "ghost" : ""}`}
                        disabled={isPending || isDone}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleWarningAction(wa);
                        }}
                      >
                        {isDone
                          ? lang === "ko" ? "완료" : "Done"
                          : isPending
                          ? lang === "ko" ? "처리 중…" : "Working…"
                          : wa.actionLabel}
                      </button>
                    )}
                    {it.href && <I.chevR size={14} style={{ color: "var(--t-3)" }} />}
                  </div>
                </Container>
              );
            })}
          </div>
        </section>

        <section className="card span-5 ai-card">
          <div className="sec-h">
            <div className="title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <I.sparkle size={14} />
              {t.aiPrice}
            </div>
            <span className="pill acc dot" style={{ textTransform: "none" }}>
              {recommendations.model
                ? `ML · n=${recommendations.model.totalSamples} · MAE ₩${(recommendations.model.avgTrainMae / 1000).toFixed(0)}K`
                : "Heuristic"}
            </span>
          </div>
          <div className="ai-body">
            <div className="ai-headline">
              <div className="num big">
                {recommendations.extraRevenueNext14 >= 0 ? "+" : ""}₩{recommendations.extraRevenueNext14.toLocaleString()}
              </div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                {lang === "ko" ? "다음 14일 추가 수익 (추천 적용 시)" : "Extra revenue next 14 days (if applied)"}
                {recommendations.model && (
                  <> · <span title={lang === "ko" ? "학습된 모델이 있는 객실 타입 수" : "Room types with a learned model"}>
                    {recommendations.model.roomTypesWithModel}{lang === "ko" ? "개 객실 학습됨" : " RT modeled"}
                  </span></>
                )}
              </div>
            </div>
            <div className="ai-list">
              {recommendations.recs.length === 0 ? (
                <div className="text-muted" style={{ fontSize: 12, padding: "12px 0", textAlign: "center" }}>
                  {lang === "ko" ? "현재 추천 없음 — 가격이 최적화되어 있습니다." : "No recommendations — pricing looks optimal."}
                </div>
              ) : (
                recommendations.recs.map((s) => {
                  const ch = channelById(s.topChannel);
                  const key = `${s.roomTypeId}:${s.date}`;
                  const isApplied = appliedIds.has(key);
                  const isPending = pendingId === key;
                  const isExpanded = expandedExplain === key;
                  const canExplain = s.source === "ml" && s.explanation && s.explanation.length > 0;
                  return (
                    <div key={key}>
                      <div className="ai-row" title={s.reason}>
                        <div className="day">{formatDay(s.date)}</div>
                        <div className="rt">
                          <span className={`dot ${ch?.cls}`} /> {s.roomTypeName}
                          <span className="text-muted" style={{ fontSize: 10, marginLeft: 4 }}>· {s.occupancyPct}%</span>
                        </div>
                        <div className="prc">
                          <span className="old num">₩{(s.currentRate / 1000).toFixed(0)}K</span>
                          <I.arrowR size={11} />
                          <span className="new num">₩{(s.suggestedRate / 1000).toFixed(0)}K</span>
                          <span className={s.deltaPct >= 0 ? "up num" : "num"} style={s.deltaPct < 0 ? { color: "var(--bad)", fontSize: "var(--fs-xs)", fontWeight: 600 } : undefined}>
                            {s.deltaPct >= 0 ? "+" : ""}{s.deltaPct.toFixed(0)}%
                          </span>
                          {canExplain && (
                            <button
                              className="btn ghost sm explain-btn"
                              onClick={() => setExpandedExplain(isExpanded ? null : key)}
                              title={lang === "ko" ? "설명 보기" : "Why?"}
                              aria-expanded={isExpanded}
                            >
                              <I.info size={11} />
                            </button>
                          )}
                          {isApplied ? (
                            <span className="pill ok" style={{ height: 16, fontSize: 9, padding: "0 5px" }}>✓</span>
                          ) : (
                            <button
                              className="btn ghost sm"
                              onClick={() => applyOne(s)}
                              disabled={!!pendingId}
                              style={{ padding: "0 6px", height: 18, fontSize: 10 }}
                            >
                              {isPending ? "…" : lang === "ko" ? "적용" : "Apply"}
                            </button>
                          )}
                        </div>
                      </div>
                      {isExpanded && canExplain && s.explanation && (
                        <ExplainPanel lang={lang} explanation={s.explanation} confidence={s.confidence} />
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <div className="ai-foot">
              <button
                className="btn primary"
                onClick={applyAll}
                disabled={!!pendingId || recommendations.recs.length === 0 || recommendations.recs.every((r) => appliedIds.has(`${r.roomTypeId}:${r.date}`))}
              >
                <I.zap size={13} /> {pendingId === "__all__" ? "…" : lang === "ko" ? "추천 모두 적용" : "Apply all"}
              </button>
              <a href="/calendar" className="btn ghost">{lang === "ko" ? "캘린더 보기" : "Open calendar"}</a>
            </div>
          </div>
        </section>

        <section className="card span-7">
          <div className="sec-h">
            <div>
              <div className="title">{lang === "ko" ? "오늘 체크인" : "Today's arrivals"}</div>
              <div className="sub">{arrivals.length} {lang === "ko" ? "건" : "guests"} · {lang === "ko" ? "DB 연결됨" : "live from DB"}</div>
            </div>
            <button className="btn sm ghost">
              {lang === "ko" ? "전체" : "View all"} <I.chevR size={12} />
            </button>
          </div>
          {arrivals.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--t-3)", fontSize: 13 }}>
              {lang === "ko" ? "오늘 체크인 예약이 없습니다." : "No arrivals scheduled today."}
            </div>
          ) : (
            <table className="t-list">
              <thead>
                <tr>
                  <th>{lang === "ko" ? "게스트" : "Guest"}</th>
                  <th>{lang === "ko" ? "채널" : "Channel"}</th>
                  <th className="r">{lang === "ko" ? "박" : "Nights"}</th>
                  <th className="r">{lang === "ko" ? "총액" : "Total"}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {arrivals.map((g) => {
                  const ch = channelById(g.channel);
                  return (
                    <tr key={g.id}>
                      <td>
                        <div className="g-cell">
                          <span className="flag">{g.flag}</span>
                          <span className="g-name">{g.name}</span>
                        </div>
                      </td>
                      <td>
                        <span className="mini-ch">
                          <span className={`dot ${ch?.cls}`} />
                          {ch?.name}
                        </span>
                      </td>
                      <td className="r num">{g.nights}</td>
                      <td className="r num">₩{g.total.toLocaleString()}</td>
                      <td className="r">
                        <button className="btn sm ghost">
                          <I.more size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="card span-5">
          <div className="sec-h">
            <div>
              <div className="title">{lang === "ko" ? "채널 믹스 (이번 달)" : "Channel mix (MTD)"}</div>
              <div className="sub">₩{(channelMixTotalRev / 1_000_000).toFixed(1)}M · {channelMixTotalCount} {lang === "ko" ? "예약" : "bookings"}</div>
            </div>
            <button className="btn sm ghost">
              <I.chevD size={12} /> {lang === "ko" ? "이번 달" : "This month"}
            </button>
          </div>
          <div className="ch-mix">
            <div className="mix-bar">
              {channelMix.map((m) => (
                <div
                  key={m.id}
                  className="seg"
                  style={{ flex: m.pct, background: `var(--ch-${m.id})` }}
                  title={`${channelById(m.id)?.name} ${m.pct}%`}
                />
              ))}
            </div>
            <div className="mix-list">
              {channelMix.map((m) => {
                const ch = channelById(m.id);
                return (
                  <div key={m.id} className="mix-row">
                    <span className="mini-ch">
                      <span className={`dot ${ch?.cls}`} />
                      {ch?.name}
                    </span>
                    <div className="pct-bar">
                      <div className="fill" style={{ width: `${m.pct * 3}%`, background: `var(--ch-${m.id})` }} />
                    </div>
                    <span className="num pct">{m.pct}%</span>
                    <span className="num rev">₩{(m.rev / 1000).toFixed(1)}K</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <style>{`
        .page { padding: 20px 24px 32px; display: flex; flex-direction: column; gap: 16px; }
        .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .dash-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 12px; }
        .events-strip .events-list {
          display: flex; gap: 8px; padding: 8px 16px 16px; overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .events-strip .events-list::-webkit-scrollbar { display: none; }
        .ev-chip {
          flex: 0 0 auto; min-width: 130px;
          padding: 8px 12px; border-radius: 8px;
          border: 1px solid var(--bd-1); background: var(--bg-elev);
          display: flex; flex-direction: column; gap: 2px;
        }
        .ev-chip .ev-day { font-size: 10px; color: var(--t-3); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500; }
        .ev-chip .ev-label { font-size: 13px; font-weight: 600; color: var(--t-1); }
        .ev-chip .ev-mult { font-size: 10px; font-weight: 600; color: var(--ok); margin-top: 2px; }
        .ev-chip.ev-holiday { border-left: 3px solid var(--bad); }
        .ev-chip.ev-concert { border-left: 3px solid var(--acc); }
        .ev-chip.ev-school  { border-left: 3px solid var(--warn); }
        .ev-chip.ev-shopping { border-left: 3px solid var(--t-3); }
        .span-5 { grid-column: span 5; }
        .span-7 { grid-column: span 7; }

        .issues { display: flex; flex-direction: column; }
        .issue {
          display: grid;
          grid-template-columns: 28px 1fr auto;
          gap: 12px; align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid var(--bd-1);
        }
        .issue:last-child { border-bottom: 0; }
        .issue .ic {
          width: 28px; height: 28px; border-radius: 999px;
          display: flex; align-items: center; justify-content: center;
        }
        .issue.bad  .ic { background: var(--bad-soft); color: var(--bad); }
        .issue.warn .ic { background: var(--warn-soft); color: var(--warn); }
        .issue.linked { text-decoration: none; cursor: pointer; transition: background .12s; }
        .issue.linked:hover { background: var(--bg-hover); }
        .issue.info .ic { background: var(--acc-soft); color: var(--acc); }
        .issue .t { font-weight: 500; color: var(--t-1); margin-bottom: 2px; font-size: var(--fs-md); }
        .issue .s { font-size: var(--fs-xs); color: var(--t-3); display: flex; align-items: center; gap: 6px; }
        .issue .actions { display: flex; gap: 6px; align-items: center; }
        .issue .actions .btn.xs { height: 24px; padding: 0 8px; font-size: 11px; font-weight: 500; }
        .mini-ch { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-xs); color: var(--t-2); font-weight: 500;}
        .mini-ch .dot { width: 7px; height: 7px; border-radius: 2px; flex: 0 0 7px;}

        .ai-card { background: linear-gradient(180deg, var(--acc-soft) 0%, var(--bg-elev) 60%); }
        .theme-dark .ai-card { background: linear-gradient(180deg, rgba(79,70,229,0.12) 0%, var(--bg-elev) 70%); }
        .ai-body { padding: 0 16px 16px; }
        .ai-headline { padding: 12px 0 16px; border-bottom: 1px solid var(--bd-1); }
        .ai-headline .big { font-size: 28px; font-weight: 600; color: var(--ok); letter-spacing: -0.02em; }
        .ai-list { display: flex; flex-direction: column; padding: 8px 0; }
        .ai-row {
          display: grid;
          grid-template-columns: 1.2fr 1.4fr auto;
          align-items: center; gap: 8px;
          padding: 8px 0;
          font-size: var(--fs-sm);
        }
        .ai-row .day { color: var(--t-2); font-weight: 500; }
        .ai-row .rt { color: var(--t-2); display: flex; align-items: center; gap: 6px;}
        .ai-row .rt .dot { width: 7px; height: 7px; border-radius: 2px; }
        .ai-row .prc { display: flex; align-items: center; gap: 6px; }
        .ai-row .old { color: var(--t-3); text-decoration: line-through; font-size: var(--fs-xs);}
        .ai-row .new { color: var(--t-1); font-weight: 600; }
        .ai-row .up  { color: var(--ok); font-size: var(--fs-xs); font-weight: 600; }
        .ai-foot { display: flex; gap: 8px; padding-top: 8px; }

        .t-list { width: 100%; border-collapse: collapse; font-size: var(--fs-md); }
        .t-list th {
          font-weight: 500; color: var(--t-3);
          text-align: left; padding: 8px 16px;
          font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.04em;
          background: var(--bg-1);
          border-bottom: 1px solid var(--bd-1);
        }
        .t-list th.r, .t-list td.r { text-align: right; }
        .t-list td { padding: 10px 16px; border-bottom: 1px solid var(--bd-1); color: var(--t-1); font-variant-numeric: tabular-nums;}
        .t-list tr:last-child td { border-bottom: 0; }
        .t-list tr:hover td { background: var(--bg-1); }
        .g-cell { display: flex; align-items: center; gap: 8px; }
        .flag { font-size: 14px; }
        .g-name { font-weight: 500; color: var(--t-1); }

        .ch-mix { padding: 12px 16px 16px; }
        .mix-bar { display: flex; height: 10px; border-radius: 999px; overflow: hidden; gap: 2px; margin-bottom: 14px; }
        .mix-list { display: flex; flex-direction: column; gap: 8px; }
        .mix-row { display: grid; grid-template-columns: 110px 1fr 40px 60px; align-items: center; gap: 10px; font-size: var(--fs-sm); }
        .pct-bar { background: var(--bg-mute); height: 6px; border-radius: 999px; overflow: hidden; }
        .pct-bar .fill { height: 100%; border-radius: 999px;}
        .pct { color: var(--t-2); text-align: right; font-weight: 500;}
        .rev { color: var(--t-3); text-align: right; }
      `}</style>
    </div>
  );
};

const FEATURE_LABELS: Record<string, { ko: string; en: string }> = {
  intercept:    { ko: "기본가",      en: "Baseline" },
  dow_sin:      { ko: "요일 (sin)",  en: "Day-of-week (sin)" },
  dow_cos:      { ko: "요일 (cos)",  en: "Day-of-week (cos)" },
  month_sin:    { ko: "계절 (sin)",  en: "Season (sin)" },
  month_cos:    { ko: "계절 (cos)",  en: "Season (cos)" },
  isWeekend:    { ko: "주말 효과",   en: "Weekend uplift" },
  leadTimeDays: { ko: "예약 리드타임", en: "Lead time" },
  occupancy:    { ko: "점유율",      en: "Occupancy" },
};

function ExplainPanel({
  lang,
  explanation,
  confidence,
}: {
  lang: Lang;
  explanation: { label: string; contribution: number; featureValue: number }[];
  confidence: "low" | "ok" | "good" | undefined;
}) {
  // Compute the largest absolute contribution so bars are scaled relative to it.
  const maxAbs = Math.max(1, ...explanation.map((e) => Math.abs(e.contribution)));
  return (
    <div className="explain-panel">
      <div className="ep-head">
        <I.sparkle size={11} />
        {lang === "ko" ? "ML 모델 설명" : "ML model explanation"}
        {confidence && (
          <span className={`pill ${confidence === "good" ? "ok" : confidence === "ok" ? "info" : "muted"}`}>
            {confidence}
          </span>
        )}
      </div>
      <div className="ep-list">
        {explanation.map((e) => {
          const meta = FEATURE_LABELS[e.label] ?? { ko: e.label, en: e.label };
          const label = lang === "ko" ? meta.ko : meta.en;
          const widthPct = (Math.abs(e.contribution) / maxAbs) * 100;
          const positive = e.contribution >= 0;
          return (
            <div key={e.label} className="ep-row" title={`feature value = ${e.featureValue.toFixed(3)}`}>
              <div className="ep-label">{label}</div>
              <div className="ep-bar">
                <div className={`ep-fill ${positive ? "pos" : "neg"}`} style={{ width: `${widthPct}%` }} />
              </div>
              <div className="ep-val num">
                {positive ? "+" : ""}₩{Math.abs(e.contribution).toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>
      <style>{`
        .explain-panel { padding: 10px 12px; margin: 4px 0 8px; background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: 6px; }
        .ep-head { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: var(--t-3); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
        .ep-head .pill { font-size: 9px; padding: 1px 5px; border-radius: 999px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
        .ep-head .pill.ok    { background: var(--ok-soft); color: var(--ok); }
        .ep-head .pill.info  { background: var(--acc-soft); color: var(--acc); }
        .ep-head .pill.muted { background: var(--bg-mute); color: var(--t-3); }
        .ep-list { display: flex; flex-direction: column; gap: 4px; }
        .ep-row { display: grid; grid-template-columns: 90px 1fr 80px; gap: 8px; align-items: center; font-size: 11px; }
        .ep-label { color: var(--t-2); font-weight: 500; }
        .ep-bar { height: 6px; background: var(--bg-mute); border-radius: 999px; overflow: hidden; position: relative; }
        .ep-fill { height: 100%; border-radius: 999px; }
        .ep-fill.pos { background: var(--ok); }
        .ep-fill.neg { background: var(--bad); }
        .ep-val { color: var(--t-1); text-align: right; font-variant-numeric: tabular-nums; }
      `}</style>
    </div>
  );
}

