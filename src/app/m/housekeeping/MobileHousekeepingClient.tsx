"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { I } from "@/components/icons";
import { MobileTabBar } from "@/components/mobile/MobileTabBar";
import type { RoomBoard, RoomStateRow, RoomStateStr } from "@/lib/queries";
import { setRoomState } from "@/lib/actions";
import { RoomState } from "@prisma/client";

const STATES: { id: RoomStateStr; ko: string; en: string; emoji: string; cls: string }[] = [
  { id: "vacant_clean", ko: "청결",     en: "Clean",    emoji: "✨", cls: "ok" },
  { id: "vacant_dirty", ko: "청소필요", en: "Dirty",    emoji: "🧹", cls: "warn" },
  { id: "occupied",     ko: "재실",     en: "Occupied", emoji: "🚪", cls: "info" },
  { id: "out_of_order", ko: "사용불가", en: "OOO",      emoji: "🚫", cls: "bad" },
];

const SETTABLE: RoomStateStr[] = ["vacant_clean", "vacant_dirty", "out_of_order"];

/**
 * Mobile housekeeping board — the same 4-state model as /housekeeping but
 * touch-tuned: bigger tap targets, single-column layout, sticky filter.
 * Designed for housekeeping staff carrying a phone room-to-room.
 */
export function MobileHousekeepingClient({ board }: { board: RoomBoard }) {
  const { lang } = useApp();
  const router = useRouter();
  const [filter, setFilter] = useState<RoomStateStr | "all">("vacant_dirty");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSet = (room: RoomStateRow, next: RoomStateStr) => {
    if (next === "occupied") return;
    setError(null);
    setPendingId(room.id);
    startTransition(async () => {
      const r = await setRoomState({ roomId: room.id, state: next as RoomState });
      setPendingId(null);
      if ("ok" in r && r.ok) router.refresh();
      else if ("error" in r) setError(r.error);
    });
  };

  const filtered = filter === "all" ? board.rooms : board.rooms.filter((r) => r.effectiveState === filter);

  return (
    <div className="m-screen">
      <div className="m-hk-head">
        <div className="m-title-row">
          <div className="m-title">{lang === "ko" ? "객실 현황" : "Housekeeping"}</div>
          <span className="text-muted" style={{ fontSize: 12 }}>{filtered.length} / {board.total}</span>
        </div>
        <div className="m-hk-chips">
          <button className={`m-chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
            {lang === "ko" ? "전체" : "All"} <span className="cnt">{board.total}</span>
          </button>
          {STATES.map((s) => (
            <button
              key={s.id}
              className={`m-chip ${s.cls} ${filter === s.id ? "active" : ""}`}
              onClick={() => setFilter(s.id)}
            >
              {s.emoji} <span className="cnt">{board.counts[s.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <div className="m-err"><I.warn size={11} /> {error}</div>}

      <div className="m-hk-list">
        {filtered.length === 0 ? (
          <div className="empty">{lang === "ko" ? "조건에 맞는 객실 없음 ✓" : "No rooms match ✓"}</div>
        ) : filtered.map((r) => {
          const meta = STATES.find((s) => s.id === r.effectiveState)!;
          const busy = pendingId === r.id;
          return (
            <div key={r.id} className={`m-room ${meta.cls}`}>
              <div className="m-room-top">
                <div>
                  <span className="num mono">{r.number}</span>
                  <span className="text-muted" style={{ fontSize: 11, marginLeft: 6 }}>{r.roomTypeName}</span>
                </div>
                <span className={`pill ${meta.cls}`}>{meta.emoji} {lang === "ko" ? meta.ko : meta.en}</span>
              </div>
              {r.currentGuestName && (
                <div className="m-room-guest">
                  <I.user size={11} /> {r.currentGuestName}
                  {r.checkoutOn && <span className="text-muted"> · → {r.checkoutOn}</span>}
                </div>
              )}
              {r.stateNote && <div className="m-room-note text-muted">&ldquo;{r.stateNote}&rdquo;</div>}
              <div className="m-room-actions">
                {SETTABLE.map((s) => {
                  const sm = STATES.find((x) => x.id === s)!;
                  const isCurrent = r.effectiveState === s;
                  return (
                    <button
                      key={s}
                      className={`btn ${isCurrent ? "primary" : "ghost"} lg`}
                      onClick={() => onSet(r, s)}
                      disabled={busy || isCurrent}
                    >
                      {busy && !isCurrent ? "…" : <>{sm.emoji} <span style={{ fontSize: 11, marginLeft: 4 }}>{lang === "ko" ? sm.ko : sm.en}</span></>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <MobileTabBar lang={lang} />

      <style>{`
        .m-screen { background: var(--bg-1); height: 100vh; overflow: hidden; display: flex; flex-direction: column; position: relative; }
        .m-hk-head { background: var(--bg-elev); border-bottom: 1px solid var(--bd-1); padding: 14px 16px 10px; }
        .m-title-row { display: flex; justify-content: space-between; align-items: center; }
        .m-title { font-size: 22px; font-weight: 600; color: var(--t-1); letter-spacing: -0.01em; }
        .m-hk-chips { display: flex; gap: 6px; margin-top: 10px; overflow-x: auto; padding-bottom: 2px; -webkit-overflow-scrolling: touch; }
        .m-hk-chips::-webkit-scrollbar { display: none; }
        .m-chip {
          flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px;
          padding: 6px 12px; border: 1px solid var(--bd-1); background: var(--bg);
          border-radius: 999px; font: inherit; font-size: 12px; color: var(--t-2); cursor: pointer;
          white-space: nowrap;
        }
        .m-chip .cnt { font-weight: 700; font-variant-numeric: tabular-nums; }
        .m-chip.active { background: var(--acc); color: white; border-color: var(--acc); }
        .m-chip.ok.active   { background: var(--ok); border-color: var(--ok); }
        .m-chip.warn.active { background: var(--warn); border-color: var(--warn); color: #fff; }
        .m-chip.info.active { background: var(--acc); border-color: var(--acc); }
        .m-chip.bad.active  { background: var(--bad); border-color: var(--bad); }
        .m-err { margin: 8px 16px 0; padding: 8px 12px; background: var(--bad-soft); color: var(--bad); border-radius: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px; }
        .m-hk-list { flex: 1; overflow: auto; padding: 12px 16px 80px; display: flex; flex-direction: column; gap: 10px; }
        .empty { padding: 48px 16px; text-align: center; color: var(--t-3); font-size: 14px; }
        .m-room {
          background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: 10px;
          padding: 12px 14px; display: flex; flex-direction: column; gap: 6px;
          border-left: 4px solid var(--bd-2);
        }
        .m-room.ok   { border-left-color: var(--ok); }
        .m-room.warn { border-left-color: var(--warn); }
        .m-room.info { border-left-color: var(--acc); }
        .m-room.bad  { border-left-color: var(--bad); }
        .m-room-top { display: flex; justify-content: space-between; align-items: center; }
        .m-room-top .num { font-weight: 700; font-size: 18px; color: var(--t-1); }
        .m-room-guest { font-size: 12px; color: var(--t-2); display: inline-flex; align-items: center; gap: 4px; }
        .m-room-note { font-size: 11px; font-style: italic; }
        .m-room-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 4px; }
        .m-room-actions .btn.lg { height: 40px; padding: 0; font-size: 13px; display: inline-flex; align-items: center; justify-content: center; }
        .pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
        .pill.ok    { background: var(--ok-soft); color: var(--ok); }
        .pill.warn  { background: var(--warn-soft); color: var(--warn); }
        .pill.info  { background: var(--acc-soft); color: var(--acc); }
        .pill.bad   { background: var(--bad-soft); color: var(--bad); }
      `}</style>
    </div>
  );
}
