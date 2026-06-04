"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { I } from "../icons";
import { channelById, type Lang } from "@/lib/i18n";
import type { AutomationOverview, AutomationTickDetail } from "@/lib/queries";
import { fetchAutomationTickDetail } from "@/lib/actions";
import { SparklineChart } from "../dashboard/SparklineChart";

interface Props {
  lang: Lang;
  overview: AutomationOverview;
}

function fmtRel(iso: string, lang: Lang): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return lang === "ko" ? `${sec}초 전` : `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return lang === "ko" ? `${min}분 전` : `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return lang === "ko" ? `${hr}시간 전` : `${hr}h ago`;
  const day = Math.round(hr / 24);
  return lang === "ko" ? `${day}일 전` : `${day}d ago`;
}

function fmtClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function Automations({ lang, overview }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [openTickId, setOpenTickId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<AutomationTickDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  const runNow = () => {
    startTransition(async () => {
      await fetch("/api/cron/run", { method: "POST" });
      router.refresh();
    });
  };

  const openDrawer = (tickId: string) => {
    setOpenTickId(tickId);
    setDrawer(null);
    setDrawerLoading(true);
    fetchAutomationTickDetail(tickId)
      .then((d) => setDrawer(d))
      .finally(() => setDrawerLoading(false));
  };
  const closeDrawer = () => {
    setOpenTickId(null);
    setDrawer(null);
  };

  const t = overview.totalsLast24h;
  const totalLast24h = t.reminders + t.noShows + t.reviews + t.warnings;

  return (
    <div className="page">
      <div className="header">
        <div>
          <h1>{lang === "ko" ? "자동화" : "Automations"}</h1>
          <div className="sub text-muted">
            {lang === "ko" ? "백그라운드 작업 모니터링 — 30분마다 실행" : "Background job monitor — runs every 30 minutes"}
          </div>
        </div>
        <button className="btn" onClick={runNow} disabled={isPending}>
          <I.refresh size={13} /> {isPending ? (lang === "ko" ? "실행 중…" : "Running…") : (lang === "ko" ? "지금 실행" : "Run now")}
        </button>
      </div>

      <div className="kpi-row">
        <Kpi label={lang === "ko" ? "체크인 안내" : "Check-in reminders"} value={t.reminders} icon={<I.send size={14} />} accent="acc" />
        <Kpi label={lang === "ko" ? "노쇼 처리" : "No-shows handled"} value={t.noShows} icon={<I.warn size={14} />} accent="warn" />
        <Kpi label={lang === "ko" ? "리뷰 요청" : "Review requests"} value={t.reviews} icon={<I.star size={14} />} accent="ok" />
        <Kpi label={lang === "ko" ? "경고 다이제스트" : "Warning digests"} value={t.warnings} icon={<I.zap size={14} />} accent="bad" />
        <Kpi label={lang === "ko" ? "이메일 발송" : "Emails sent"} value={overview.ticks.reduce((s, tick) => s + tick.emailsSent, 0)} icon={<I.send size={14} />} accent="acc" />
      </div>

      <section className="card">
        <div className="sec-h">
          <div>
            <div className="title">{lang === "ko" ? "지난 24시간 활동" : "Last 24h activity"}</div>
            <div className="sub">
              {lang === "ko"
                ? `시간별 — 합계 ${totalLast24h}건`
                : `Hourly — ${totalLast24h} total`}
            </div>
          </div>
        </div>
        <div className="spark-wrap">
          <SparklineChart data={overview.hourlyActivity} color="#4f46e5" width={680} height={70} />
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
          <div>
            <div className="title">{lang === "ko" ? "최근 실행 이력" : "Recent runs"}</div>
            <div className="sub">
              {overview.lastRunAt
                ? `${lang === "ko" ? "마지막 실행" : "Last ran"} ${fmtRel(overview.lastRunAt, lang)} · ${overview.avgDurationMs}ms ${lang === "ko" ? "평균" : "avg"}`
                : lang === "ko" ? "실행 이력 없음" : "No runs yet"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span className="text-muted" style={{ fontSize: 11 }}>
              {lang === "ko" ? "내 호텔 24시간 합계" : "My hotel 24h total"}: <strong>{totalLast24h}</strong>
            </span>
          </div>
        </div>
        {overview.ticks.length === 0 ? (
          <div className="empty">
            {lang === "ko" ? "아직 실행 이력이 없습니다. 위의 \"지금 실행\"을 눌러 cron을 트리거하세요." : "No automation runs yet. Click \"Run now\" above to trigger the cron."}
          </div>
        ) : (
          <table className="t-list">
            <thead>
              <tr>
                <th>{lang === "ko" ? "시각" : "Time"}</th>
                <th className="r">{lang === "ko" ? "체크인 안내" : "Reminders"}</th>
                <th className="r">{lang === "ko" ? "노쇼" : "No-shows"}</th>
                <th className="r">{lang === "ko" ? "리뷰" : "Reviews"}</th>
                <th className="r">{lang === "ko" ? "경고" : "Warnings"}</th>
                <th className="r">{lang === "ko" ? "소요" : "Duration"}</th>
                <th>{lang === "ko" ? "상태" : "Status"}</th>
              </tr>
            </thead>
            <tbody>
              {overview.ticks.map((tick) => {
                const total = tick.remindersSent + tick.noShowsCancelled + tick.reviewRequestsSent + tick.warningsDigested;
                const my = tick.myCounts.reminders + tick.myCounts.noShows + tick.myCounts.reviews + tick.myCounts.warnings;
                const isOpen = openTickId === tick.id;
                return (
                  <tr
                    key={tick.id}
                    className={`tick-row ${isOpen ? "open" : ""}`}
                    onClick={() => openDrawer(tick.id)}
                  >
                    <td>
                      <div style={{ fontWeight: 500 }}>{fmtClock(tick.ranAt)}</div>
                      <div className="text-muted" style={{ fontSize: 11 }} data-testid="ago">{fmtRel(tick.ranAt, lang)}</div>
                    </td>
                    <td className="r num">
                      <span style={{ fontWeight: 500 }}>{tick.myCounts.reminders}</span>
                      {total > my && <span className="text-muted" style={{ fontSize: 11 }}> /{tick.remindersSent}</span>}
                    </td>
                    <td className="r num">
                      <span style={{ fontWeight: 500 }}>{tick.myCounts.noShows}</span>
                      {total > my && <span className="text-muted" style={{ fontSize: 11 }}> /{tick.noShowsCancelled}</span>}
                    </td>
                    <td className="r num">
                      <span style={{ fontWeight: 500 }}>{tick.myCounts.reviews}</span>
                      {total > my && <span className="text-muted" style={{ fontSize: 11 }}> /{tick.reviewRequestsSent}</span>}
                    </td>
                    <td className="r num">
                      <span style={{ fontWeight: 500 }}>{tick.myCounts.warnings}</span>
                      {total > my && <span className="text-muted" style={{ fontSize: 11 }}> /{tick.warningsDigested}</span>}
                    </td>
                    <td className="r num text-muted">{tick.durationMs}ms</td>
                    <td>
                      {tick.errors ? (
                        <span className="pill bad" title={tick.errors}>
                          <I.warn size={11} /> {lang === "ko" ? "오류" : "Error"}
                        </span>
                      ) : (
                        <span className="pill ok">
                          <I.check size={11} /> {lang === "ko" ? "정상" : "OK"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {openTickId && (
        <TickDrawer lang={lang} loading={drawerLoading} detail={drawer} onClose={closeDrawer} />
      )}

      <style>{`
        .page { padding: 20px 24px 32px; display: flex; flex-direction: column; gap: 16px; }
        .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .header h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin: 0; color: var(--t-1); }
        .header .sub { font-size: 12px; margin-top: 2px; }
        .kpi-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
        .empty { padding: 32px; text-align: center; color: var(--t-3); font-size: 13px; }
        .spark-wrap { padding: 8px 16px 16px; }
        .spark-axis { display: flex; justify-content: space-between; padding: 4px 4px 0; font-size: 10px; color: var(--t-4); }
        .tick-row { cursor: pointer; transition: background .12s; }
        .tick-row:hover td { background: var(--bg-1); }
        .tick-row.open td { background: var(--acc-soft); }
        .t-list { width: 100%; border-collapse: collapse; font-size: var(--fs-md); }
        .t-list th { font-weight: 500; color: var(--t-3); text-align: left; padding: 8px 16px; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.04em; background: var(--bg-1); border-bottom: 1px solid var(--bd-1);}
        .t-list th.r, .t-list td.r { text-align: right; }
        .t-list td { padding: 10px 16px; border-bottom: 1px solid var(--bd-1); color: var(--t-1); font-variant-numeric: tabular-nums;}
        .t-list tr:last-child td { border-bottom: 0;}
        .pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; }
        .pill.ok { background: var(--ok-soft); color: var(--ok); }
        .pill.bad { background: var(--bad-soft); color: var(--bad); }
      `}</style>
    </div>
  );
}

function Kpi({ label, value, icon, accent }: { label: string; value: number; icon: React.ReactNode; accent: "acc" | "ok" | "warn" | "bad" }) {
  const colorVar = `var(--${accent})`;
  return (
    <div className="kpi">
      <div className="kpi-top">
        <span className="kpi-label tracker">{label}</span>
        <span className="kpi-icon" style={{ color: colorVar }}>{icon}</span>
      </div>
      <div className="kpi-val"><span className="num v">{value}</span></div>
      <div className="kpi-bot text-muted" style={{ fontSize: 11 }}>last 24h</div>
      <style>{`
        .kpi { background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: var(--r-md); padding: 14px 16px 12px; display: flex; flex-direction: column; gap: 6px; min-height: 100px; }
        .kpi-top { display: flex; align-items: center; justify-content: space-between; }
        .kpi-label { color: var(--t-3); font-size: 11px; }
        .kpi-icon { display: inline-flex; }
        .kpi-val .v { font-size: 26px; font-weight: 600; color: var(--t-1); letter-spacing: -0.02em;}
        .kpi-bot { letter-spacing: 0.04em; text-transform: uppercase; }
      `}</style>
    </div>
  );
}

function tagLabel(tag: string, lang: Lang): string {
  if (tag.startsWith("checkin-reminder")) return lang === "ko" ? "체크인 안내" : "Check-in reminder";
  if (tag.startsWith("review-request")) return lang === "ko" ? "리뷰 요청" : "Review request";
  if (tag.startsWith("warn-digest:")) {
    const kind = tag.split(":")[1] ?? "";
    return lang === "ko" ? `경고 다이제스트 (${kind})` : `Warning digest (${kind})`;
  }
  if (tag.includes("no-show")) return lang === "ko" ? "노쇼 처리" : "No-show";
  return tag;
}

function TickDrawer({ lang, loading, detail, onClose }: { lang: Lang; loading: boolean; detail: AutomationTickDetail | null; onClose: () => void }) {
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Automation tick detail">
        <div className="d-head">
          <div>
            <div className="title">{lang === "ko" ? "실행 상세" : "Tick detail"}</div>
            {detail && (
              <div className="sub text-muted">
                {new Date(detail.tick.ranAt).toLocaleString(lang === "ko" ? "ko-KR" : "en-US")} · {detail.tick.durationMs}ms
              </div>
            )}
          </div>
          <button className="btn icon ghost" onClick={onClose} aria-label="Close">
            <I.close size={14} />
          </button>
        </div>
        <div className="d-body">
          {loading && <div className="empty">{lang === "ko" ? "불러오는 중…" : "Loading…"}</div>}
          {!loading && !detail && <div className="empty">{lang === "ko" ? "데이터를 찾을 수 없습니다." : "No detail found."}</div>}
          {detail && (
            <>
              <div className="section-label">{lang === "ko" ? "내 호텔" : "My hotel"}</div>
              <div className="counts-grid">
                <CountTile label={lang === "ko" ? "체크인 안내" : "Reminders"} value={detail.tick.myCounts.reminders} />
                <CountTile label={lang === "ko" ? "노쇼" : "No-shows"} value={detail.tick.myCounts.noShows} />
                <CountTile label={lang === "ko" ? "리뷰" : "Reviews"} value={detail.tick.myCounts.reviews} />
                <CountTile label={lang === "ko" ? "경고" : "Warnings"} value={detail.tick.myCounts.warnings} />
              </div>

              <div className="section-label">{lang === "ko" ? "전체 호텔" : "All hotels"}</div>
              {Object.keys(detail.byHotel).length === 0 ? (
                <div className="empty mini">{lang === "ko" ? "활동 없음" : "No activity"}</div>
              ) : (
                <table className="micro-list">
                  <thead><tr>
                    <th>Hotel</th><th className="r">R</th><th className="r">N</th><th className="r">Rv</th><th className="r">W</th>
                  </tr></thead>
                  <tbody>
                    {Object.entries(detail.byHotel).map(([hid, c]) => (
                      <tr key={hid}>
                        <td className="text-muted" style={{ fontFamily: "monospace", fontSize: 10 }}>{hid.slice(-8)}</td>
                        <td className="r num">{c.reminders}</td>
                        <td className="r num">{c.noShows}</td>
                        <td className="r num">{c.reviews}</td>
                        <td className="r num">{c.warnings}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="section-label">
                {lang === "ko" ? `영향받은 예약 (±5분 내)` : `Affected bookings (±5min)`} · {detail.events.length}
              </div>
              {detail.events.length === 0 ? (
                <div className="empty mini">
                  {lang === "ko" ? "이 시각 주변에 발사된 자동 작업이 없습니다." : "No auto events fired near this tick."}
                </div>
              ) : (
                <ul className="event-list">
                  {detail.events.map((e, i) => {
                    const ch = channelById(e.channel);
                    return (
                      <li key={`${e.bookingId}-${i}`} className="event">
                        <span className={`dot ${ch?.cls ?? ""}`} />
                        <div className="ev-body">
                          <div className="ev-title">{e.guestName} <span className="text-muted" style={{ fontWeight: 400 }}>· {e.bookingRef ?? e.bookingId.slice(-6)}</span></div>
                          <div className="ev-tag text-muted">{tagLabel(e.tag, lang)}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {detail.tick.errors && (
                <>
                  <div className="section-label" style={{ color: "var(--bad)" }}>{lang === "ko" ? "오류" : "Errors"}</div>
                  <pre className="errors">{detail.tick.errors}</pre>
                </>
              )}
            </>
          )}
        </div>
        <style>{`
          .drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.32); z-index: 60; display: flex; justify-content: flex-end; }
          .drawer {
            width: min(440px, 100vw); height: 100%; background: var(--bg);
            border-left: 1px solid var(--bd-1); display: flex; flex-direction: column;
            box-shadow: var(--shadow-pop, -8px 0 24px rgba(0,0,0,0.18));
          }
          .d-head { display: flex; justify-content: space-between; align-items: flex-start; padding: 16px 16px 12px; border-bottom: 1px solid var(--bd-1); }
          .d-head .title { font-weight: 600; color: var(--t-1); font-size: 14px; }
          .d-head .sub { font-size: 11px; margin-top: 2px; }
          .d-body { flex: 1; overflow-y: auto; padding: 12px 16px 24px; }
          .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--t-3); margin: 16px 0 6px; font-weight: 500; }
          .section-label:first-child { margin-top: 4px; }
          .counts-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
          .empty { padding: 24px; text-align: center; color: var(--t-3); font-size: 12px; }
          .empty.mini { padding: 12px; }
          .micro-list { width: 100%; border-collapse: collapse; font-size: 11px; }
          .micro-list th { text-align: left; color: var(--t-3); padding: 4px 6px; font-size: 10px; font-weight: 500; border-bottom: 1px solid var(--bd-1); }
          .micro-list td { padding: 4px 6px; border-bottom: 1px solid var(--bd-1); }
          .micro-list th.r, .micro-list td.r { text-align: right; }
          .event-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2px; }
          .event { display: flex; align-items: flex-start; gap: 8px; padding: 8px 4px; border-bottom: 1px solid var(--bd-1); }
          .event:last-child { border-bottom: 0; }
          .event .dot { width: 8px; height: 8px; border-radius: 2px; margin-top: 4px; flex: 0 0 8px; }
          .event .ev-body { flex: 1; min-width: 0; }
          .event .ev-title { font-size: 12px; font-weight: 500; color: var(--t-1); }
          .event .ev-tag { font-size: 11px; margin-top: 1px; }
          .errors { background: var(--bad-soft); color: var(--bad); padding: 10px 12px; border-radius: 6px; font-size: 11px; white-space: pre-wrap; word-break: break-all; }
        `}</style>
      </aside>
    </div>
  );
}

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="ct">
      <div className="cl">{label}</div>
      <div className="cv">{value}</div>
      <style>{`
        .ct { background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: 5px; padding: 8px 10px; }
        .cl { color: var(--t-3); font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500; }
        .cv { font-size: 18px; font-weight: 600; color: var(--t-1); margin-top: 2px; font-variant-numeric: tabular-nums; }
      `}</style>
    </div>
  );
}
