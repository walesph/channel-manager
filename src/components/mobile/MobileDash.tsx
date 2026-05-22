"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { I } from "../icons";
import { channelById, type Lang } from "@/lib/i18n";
import type { ArrivalRow, CalendarGrid, MobileDashboardData } from "@/lib/queries";
import { setBookingStatus } from "@/lib/actions";
import { MobileNewBookingSheet } from "./MobileNewBookingSheet";
import { MobileTabBar } from "./MobileTabBar";


interface ArrivalState extends ArrivalRow {
  checkedIn?: boolean;
}

export const MobileDash = ({ lang = "ko", data }: { lang?: Lang; data: MobileDashboardData }) => {
  const router = useRouter();
  const { arrivals, kpi, issuesCount, roomTypeOptions } = data;
  const allSynced = kpi.syncedChannels === kpi.totalChannels;

  const [optimisticArrivals, markCheckedIn] = useOptimistic<ArrivalState[], string>(
    arrivals as ArrivalState[],
    (state, id) => state.map((a) => (a.id === id ? { ...a, checkedIn: true } : a)),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [newOpen, setNewOpen] = useState(false);

  const checkIn = (id: string) => {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      markCheckedIn(id);
      const r = await setBookingStatus(id, "check_in");
      setPendingId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="m-screen">
      <div className="m-top">
        <div>
          <div className="m-greet text-muted">{lang === "ko" ? "안녕하세요, 박매니저님" : "Hi, Manager Park"}</div>
          <div className="m-title">{lang === "ko" ? "오늘의 운영" : "Today's operations"}</div>
        </div>
        <div className="m-av">민</div>
      </div>

      <div className="m-sync">
        <div className={`m-sync-dot ${allSynced ? "ok" : "warn"}`} />
        <span style={{ flex: 1, fontSize: 12 }}>
          {lang === "ko"
            ? `${kpi.syncedChannels}/${kpi.totalChannels}개 채널 동기화됨`
            : `${kpi.syncedChannels}/${kpi.totalChannels} channels synced`}
        </span>
      </div>

      <div className="m-kpis">
        <div className="m-kpi">
          <div className="lbl tracker">{lang === "ko" ? "점유율" : "Occupancy"}</div>
          <div className="val num">{kpi.occupancy}%</div>
          <div className="dlt up">{arrivals.length} {lang === "ko" ? "건 도착" : "arrivals"}</div>
        </div>
        <div className="m-kpi">
          <div className="lbl tracker">{lang === "ko" ? "오늘 매출" : "Today rev."}</div>
          <div className="val num">₩{(kpi.todayRevenue / 1_000_000).toFixed(1)}M</div>
          <div className="dlt up">{lang === "ko" ? "재실 객실" : "in-house"}</div>
        </div>
      </div>

      <div className="m-card">
        <div className="m-card-h">
          <span style={{ fontWeight: 600, fontSize: 14 }}>{lang === "ko" ? "주의 필요" : "Needs attention"}</span>
          <span className={`pill ${issuesCount === 0 ? "ok" : "bad"}`}>{issuesCount}</span>
        </div>
        {issuesCount === 0 ? (
          <div className="text-muted" style={{ fontSize: 12, padding: "8px 0", textAlign: "center" }}>
            {lang === "ko" ? "모두 정상입니다 ✓" : "All clear ✓"}
          </div>
        ) : (
          <div className="m-issue warn">
            <div className="m-iico"><I.warn size={14} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {lang === "ko" ? `최근 24시간 이슈 ${issuesCount}건` : `${issuesCount} issues in last 24h`}
              </div>
              <div className="text-muted" style={{ fontSize: 11 }}>{lang === "ko" ? "동기화 로그 확인" : "See sync log"}</div>
            </div>
            <I.chevR size={14} style={{ color: "var(--t-3)" }} />
          </div>
        )}
      </div>

      <div className="m-card">
        <div className="m-card-h">
          <span style={{ fontWeight: 600, fontSize: 14 }}>{lang === "ko" ? "오늘 체크인" : "Arrivals"}</span>
          <span className="text-muted" style={{ fontSize: 12 }}>{optimisticArrivals.length}</span>
        </div>
        {error && <div className="m-arr-err">{error}</div>}
        {optimisticArrivals.length === 0 ? (
          <div className="text-muted" style={{ fontSize: 12, padding: "8px 0", textAlign: "center" }}>
            {lang === "ko" ? "오늘 체크인 예약이 없습니다" : "No arrivals today"}
          </div>
        ) : (
          optimisticArrivals.map((g) => {
            const c = channelById(g.channel)!;
            const isPending = pendingId === g.id;
            return (
              <div key={g.id} className="m-arr">
                <span className="flag" style={{ fontSize: 18 }}>{g.flag}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{g.name}</div>
                  <div className="mini-ch" style={{ fontSize: 10 }}>
                    <span className={`dot ${c.cls}`} />{c.name} · {g.nights}{lang === "ko" ? "박" : "n"} · ₩{(g.total / 1000).toLocaleString()}K
                  </div>
                </div>
                {g.checkedIn ? (
                  <span className="pill ok dot" style={{ height: 22, fontSize: 10 }}>
                    {lang === "ko" ? "재실" : "In-house"}
                  </span>
                ) : (
                  <button
                    className="btn sm primary"
                    onClick={() => checkIn(g.id)}
                    disabled={isPending}
                    style={{ height: 28, padding: "0 10px" }}
                  >
                    {isPending ? "…" : lang === "ko" ? "체크인" : "Check in"}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <button
        className="m-fab"
        onClick={() => setNewOpen(true)}
        aria-label={lang === "ko" ? "신규 예약" : "New booking"}
      >
        <I.plus size={22} />
      </button>

      <MobileNewBookingSheet
        lang={lang}
        open={newOpen}
        onClose={() => setNewOpen(false)}
        roomTypes={roomTypeOptions}
      />

      <MobileTabBar lang={lang} />

      <style>{`
        .m-screen { background: var(--bg-1); height: 100%; overflow: auto; padding: 12px 16px 80px; display: flex; flex-direction: column; gap: 12px; position: relative;}
        .m-top { display: flex; justify-content: space-between; align-items: center; padding: 8px 0;}
        .m-greet { font-size: 12px;}
        .m-title { font-size: 22px; font-weight: 600; color: var(--t-1); letter-spacing: -0.01em;}
        .m-av { width: 36px; height: 36px; border-radius: 999px; background: linear-gradient(135deg, #fcd34d, #f59e0b); color: #78350f; font-weight: 700; display: flex; align-items: center; justify-content: center;}
        .m-sync { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: var(--r-md);}
        .m-sync-dot { width: 8px; height: 8px; border-radius: 999px;}
        .m-sync-dot.ok { background: var(--ok); box-shadow: 0 0 0 4px rgba(22,163,74,0.15);}
        .m-sync-dot.warn { background: var(--warn); box-shadow: 0 0 0 4px rgba(234,88,12,0.15);}
        .m-kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 8px;}
        .m-kpi { background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: var(--r-md); padding: 12px 14px;}
        .m-kpi .lbl { font-size: 10px; color: var(--t-3);}
        .m-kpi .val { font-size: 22px; font-weight: 600; margin: 4px 0 2px; letter-spacing: -0.02em;}
        .m-kpi .dlt { font-size: 11px; font-weight: 600; color: var(--t-3);}
        .m-card { background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: var(--r-md); padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;}
        .m-card-h { display: flex; justify-content: space-between; align-items: center;}
        .m-issue { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--bd-1);}
        .m-iico { width: 28px; height: 28px; border-radius: 999px; display: flex; align-items: center; justify-content: center; flex: 0 0 28px;}
        .m-issue.bad .m-iico { background: var(--bad-soft); color: var(--bad);}
        .m-issue.warn .m-iico { background: var(--warn-soft); color: var(--warn);}
        .m-arr { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--bd-1);}
        .m-arr-err { font-size: 11px; color: var(--bad); background: var(--bad-soft); padding: 6px 8px; border-radius: 4px; margin-top: 4px;}
        .mini-ch { display: inline-flex; align-items: center; gap: 4px; color: var(--t-3);}
        .mini-ch .dot { width: 5px; height: 5px; border-radius: 1px;}
        .m-fab {
          position: fixed; right: 18px; bottom: 80px;
          width: 52px; height: 52px;
          border-radius: 999px;
          background: var(--acc); color: white;
          border: 0; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 6px 16px rgba(79, 70, 229, 0.35);
          z-index: 50;
        }
        .m-fab:active { transform: scale(0.96); }
      `}</style>
    </div>
  );
};

/**
 * Mobile day-list calendar. The original `MobileCal` (kept below for the
 * non-mobile-tab use case) renders a 7×N grid that's hard to read on phones.
 * This version picks one day at a time and lists each room type vertically:
 *
 *   ┌── day picker (horizontal scroll, 7 chips) ──┐
 *   │  Mon 5/4   Tue 5/5  ●Wed 5/6  Thu 5/7 ...   │
 *   ├──────────────────────────────────────────────┤
 *   │  ◀  May 6 (Wed)   ▶                          │
 *   │  Deluxe Twin                                 │
 *   │  ▓▓▓▓▓▓░░░  6/12 available · ₩140K           │
 *   │  ...                                          │
 *   └──────────────────────────────────────────────┘
 *
 * Touch swipe (left/right ≥ 40px) cycles days. Falls back to ◀ ▶ buttons.
 */
export const MobileCalDayList = ({ lang = "ko", grid }: { lang?: Lang; grid: CalendarGrid }) => {
  const [selectedIdx, setSelectedIdx] = useState(() => grid.days.findIndex((d) => d.today) >= 0 ? grid.days.findIndex((d) => d.today) : 0);
  const touchStartX = useRef<number | null>(null);

  const day = grid.days[selectedIdx];
  if (!day) return null;

  const dows = lang === "ko" ? ["일", "월", "화", "수", "목", "금", "토"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dateLabel = (() => {
    const d = new Date(`${day.iso}T00:00:00Z`);
    const m = d.getUTCMonth() + 1;
    const dom = d.getUTCDate();
    const dow = dows[d.getUTCDay()];
    return lang === "ko" ? `${m}월 ${dom}일 (${dow})` : `${d.toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${dom} (${dow})`;
  })();

  const goPrev = () => setSelectedIdx((i) => Math.max(0, i - 1));
  const goNext = () => setSelectedIdx((i) => Math.min(grid.days.length - 1, i + 1));

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx > 0) goPrev();
    else goNext();
  };

  return (
    <div className="m-screen" style={{ padding: 0 }}>
      <div style={{ padding: "14px 16px 8px", borderBottom: "1px solid var(--bd-1)", background: "var(--bg-elev)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="m-title" style={{ fontSize: 20 }}>{lang === "ko" ? "캘린더" : "Calendar"}</div>
          <button className="btn ghost icon" aria-label="filter"><I.filter size={14} /></button>
        </div>
        <div className="day-strip">
          {grid.days.map((d, i) => {
            const date = new Date(`${d.iso}T00:00:00Z`);
            const dow = dows[date.getUTCDay()];
            const dom = date.getUTCDate();
            const isSel = i === selectedIdx;
            return (
              <button
                key={d.iso}
                className={`day-chip ${isSel ? "sel" : ""} ${d.today ? "today" : ""}`}
                onClick={() => setSelectedIdx(i)}
              >
                <span className="dow">{dow}</span>
                <span className="dom">{dom}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="day-body"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="day-nav">
          <button className="btn icon ghost" onClick={goPrev} disabled={selectedIdx === 0} aria-label="prev day">
            <I.arrowL size={14} />
          </button>
          <div className="date-label">{dateLabel}</div>
          <button className="btn icon ghost" onClick={goNext} disabled={selectedIdx === grid.days.length - 1} aria-label="next day">
            <I.arrowR size={14} />
          </button>
        </div>

        <div className="rt-list">
          {grid.rows.map((rt) => {
            const cell = rt.cells[selectedIdx];
            if (!cell) return null;
            const occupied = cell.capacity - cell.available;
            const occupiedPct = cell.capacity > 0 ? Math.min(1, occupied / cell.capacity) * 100 : 0;
            const rates = Object.entries(cell.rates ?? {});
            return (
              <div key={rt.roomTypeId} className="rt-card">
                <div className="rt-head">
                  <div>
                    <div className="rt-name">{rt.name}</div>
                    <div className="rt-meta text-muted">{rt.count}{lang === "ko" ? "실" : " rooms"}</div>
                  </div>
                  <div className={`rt-pill ${cell.over ? "bad" : cell.available === 0 ? "warn" : "ok"}`}>
                    {cell.over
                      ? lang === "ko" ? "오버부킹" : "Overbooked"
                      : cell.available === 0
                      ? lang === "ko" ? "매진" : "Sold out"
                      : `${cell.available}${lang === "ko" ? " 가능" : " open"}`}
                  </div>
                </div>
                <div className="rt-bar">
                  <div
                    className={`fill ${cell.over ? "bad" : ""}`}
                    style={{ width: `${cell.over ? 100 : occupiedPct}%` }}
                  />
                </div>
                <div className="rt-foot">
                  <span className="text-muted" style={{ fontSize: 11 }}>
                    {occupied}/{cell.capacity} {lang === "ko" ? "예약" : "booked"}
                  </span>
                  {rates.length > 0 && (
                    <span className="rates text-muted" style={{ fontSize: 11 }}>
                      ₩{(Math.min(...rates.map(([, r]) => r)) / 1000).toFixed(0)}K~
                    </span>
                  )}
                  {cell.closed && <span className="closed">CLOSED</span>}
                </div>
              </div>
            );
          })}
          {grid.rows.length === 0 && (
            <div className="empty">{lang === "ko" ? "객실 타입이 없습니다" : "No room types"}</div>
          )}
        </div>
      </div>

      <MobileTabBar lang={lang} />

      <style>{`
        .m-screen { background: var(--bg-1); height: 100vh; overflow: hidden; display: flex; flex-direction: column; position: relative;}
        .m-title { font-size: 22px; font-weight: 600; color: var(--t-1); letter-spacing: -0.01em;}
        .day-strip { display: flex; gap: 6px; margin-top: 12px; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
        .day-strip::-webkit-scrollbar { display: none; }
        .day-chip {
          flex: 0 0 auto; display: flex; flex-direction: column; align-items: center;
          padding: 6px 10px; border: 1px solid var(--bd-1); border-radius: 10px;
          background: var(--bg); cursor: pointer; min-width: 44px; transition: background .12s, border-color .12s;
        }
        .day-chip .dow { font-size: 9px; color: var(--t-3); text-transform: uppercase; letter-spacing: 0.04em; }
        .day-chip .dom { font-size: 14px; font-weight: 600; color: var(--t-1); }
        .day-chip.today .dom { color: var(--acc); }
        .day-chip.sel { background: var(--acc); border-color: var(--acc); }
        .day-chip.sel .dow, .day-chip.sel .dom { color: white; }
        .day-body { flex: 1; overflow-y: auto; padding-bottom: 80px; touch-action: pan-y; }
        .day-nav { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 8px; }
        .date-label { font-weight: 600; color: var(--t-1); font-size: 14px; }
        .rt-list { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 10px; }
        .rt-card { background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: 10px; padding: 12px; }
        .rt-head { display: flex; justify-content: space-between; align-items: flex-start; }
        .rt-name { font-weight: 600; color: var(--t-1); font-size: 13px; }
        .rt-meta { font-size: 10px; margin-top: 2px; }
        .rt-pill { padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; }
        .rt-pill.ok   { background: var(--ok-soft); color: var(--ok); }
        .rt-pill.warn { background: var(--warn-soft); color: var(--warn); }
        .rt-pill.bad  { background: var(--bad-soft); color: var(--bad); }
        .rt-bar { margin-top: 10px; height: 6px; background: var(--bg-mute); border-radius: 999px; overflow: hidden; }
        .rt-bar .fill { height: 100%; background: var(--acc); border-radius: 999px; transition: width .25s; }
        .rt-bar .fill.bad { background: var(--bad); }
        .rt-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
        .closed { font-size: 9px; font-weight: 600; color: var(--bad); border: 1px solid var(--bad); padding: 1px 5px; border-radius: 3px; }
        .empty { padding: 32px; text-align: center; color: var(--t-3); font-size: 12px; }
      `}</style>
    </div>
  );
};

export const MobileCal = ({ lang = "ko", grid }: { lang?: Lang; grid: CalendarGrid }) => {
  const dows = lang === "ko" ? ["일", "월", "화", "수", "목", "금", "토"] : ["S", "M", "T", "W", "T", "F", "S"];
  const monthLabel = grid.days[0]
    ? lang === "ko"
      ? `${parseInt(grid.days[0].iso.slice(0, 4))}년 ${parseInt(grid.days[0].iso.slice(5, 7))}월`
      : new Date(`${grid.days[0].iso}T00:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    : "";

  return (
    <div className="m-screen" style={{ padding: 0 }}>
      <div style={{ padding: "14px 16px 8px", borderBottom: "1px solid var(--bd-1)", background: "var(--bg-elev)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="m-title" style={{ fontSize: 20 }}>{lang === "ko" ? "캘린더" : "Calendar"}</div>
            <div className="text-muted" style={{ fontSize: 11 }}>{monthLabel}</div>
          </div>
          <button className="btn ghost icon"><I.filter size={14} /></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "70px repeat(7, 1fr)", marginTop: 12, gap: 0 }}>
          <div />
          {grid.days.map((d, i) => (
            <div key={i} style={{ textAlign: "center", padding: "4px 2px" }}>
              <div style={{ fontSize: 9, color: "var(--t-3)" }}>{dows[d.dow]}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: d.today ? "var(--acc)" : "var(--t-1)" }}>{d.dom}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: 0, overflow: "auto", flex: 1, paddingBottom: 80 }}>
        {grid.rows.map((rt) => (
          <div key={rt.roomTypeId} style={{ display: "grid", gridTemplateColumns: "70px repeat(7, 1fr)", borderBottom: "1px solid var(--bd-1)" }}>
            <div style={{ padding: "10px 8px", borderRight: "1px solid var(--bd-1)", fontSize: 11, fontWeight: 500, background: "var(--bg-1)" }}>
              {rt.name}
              <div className="text-muted" style={{ fontSize: 9 }}>{rt.count}{lang === "ko" ? "실" : ""}</div>
            </div>
            {rt.cells.map((cell, i) => {
              const d = grid.days[i];
              return (
                <div
                  key={i}
                  style={{
                    padding: "8px 4px",
                    borderRight: "1px solid var(--bd-1)",
                    textAlign: "center",
                    background: cell.over ? "#fee2e2" : d.today ? "var(--acc-soft)" : "transparent",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: cell.over ? "var(--bad)" : "var(--t-1)" }}>
                    {cell.over ? `+${cell.capacity > 0 ? "!" : "!"}` : cell.available}
                  </div>
                  <div style={{ height: 3, background: "var(--bg-mute)", borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${Math.min((cell.capacity - cell.available) / Math.max(1, cell.capacity), 1) * 100}%`,
                        height: "100%",
                        background: cell.over ? "var(--bad)" : "var(--acc)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <MobileTabBar lang={lang} />
      <style>{`
        .m-screen { background: var(--bg-1); height: 100vh; overflow: hidden; display: flex; flex-direction: column; position: relative;}
        .m-title { font-size: 22px; font-weight: 600; color: var(--t-1); letter-spacing: -0.01em;}
      `}</style>
    </div>
  );
};
