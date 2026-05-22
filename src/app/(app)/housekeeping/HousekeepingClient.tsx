"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { I } from "@/components/icons";
import type { RoomBoard, RoomStateRow, RoomStateStr } from "@/lib/queries";
import { setRoomState } from "@/lib/actions";
import { RoomState } from "@prisma/client";

const STATES: { id: RoomStateStr; ko: string; en: string; emoji: string; cls: string }[] = [
  { id: "vacant_clean", ko: "청결",   en: "Clean",     emoji: "✨", cls: "ok" },
  { id: "vacant_dirty", ko: "청소필요", en: "Dirty",     emoji: "🧹", cls: "warn" },
  { id: "occupied",     ko: "재실",   en: "Occupied",  emoji: "🚪", cls: "info" },
  { id: "out_of_order", ko: "사용불가", en: "OOO",       emoji: "🚫", cls: "bad" },
];

const SETTABLE: RoomStateStr[] = ["vacant_clean", "vacant_dirty", "out_of_order"];

export function HousekeepingClient({ board }: { board: RoomBoard }) {
  const { lang } = useApp();
  const router = useRouter();
  const [filter, setFilter] = useState<RoomStateStr | "all">("all");
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSet = (room: RoomStateRow, next: RoomStateStr) => {
    if (next === "occupied") return; // computed, never settable manually
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
    <div className="page">
      <div className="header">
        <div>
          <h1>{lang === "ko" ? "객실 현황" : "Room status"}</h1>
          <div className="sub text-muted">
            {lang === "ko" ? `${board.total}개 객실 — 하우스키핑 보드` : `${board.total} rooms — housekeeping board`}
          </div>
        </div>
      </div>

      <div className="counts">
        <button className={`count-tile ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
          <span className="lbl">{lang === "ko" ? "전체" : "All"}</span>
          <span className="val">{board.total}</span>
        </button>
        {STATES.map((s) => (
          <button
            key={s.id}
            className={`count-tile ${s.cls} ${filter === s.id ? "active" : ""}`}
            onClick={() => setFilter(s.id === filter ? "all" : s.id)}
          >
            <span className="lbl">{s.emoji} {lang === "ko" ? s.ko : s.en}</span>
            <span className="val">{board.counts[s.id]}</span>
          </button>
        ))}
      </div>

      {error && <div className="alert"><I.warn size={12} /> {error}</div>}

      <section className="card">
        <div className="grid">
          {filtered.length === 0 ? (
            <div className="empty">{lang === "ko" ? "조건에 맞는 객실 없음" : "No rooms match"}</div>
          ) : filtered.map((r) => {
            const meta = STATES.find((s) => s.id === r.effectiveState)!;
            const busy = pendingId === r.id;
            return (
              <div key={r.id} className={`room-tile ${meta.cls}`}>
                <div className="rt-head">
                  <span className="num mono">{r.number}</span>
                  <span className={`pill ${meta.cls}`}>{meta.emoji} {lang === "ko" ? meta.ko : meta.en}</span>
                </div>
                <div className="rt-type text-muted">{r.roomTypeName}</div>
                {r.currentGuestName && (
                  <div className="rt-guest">
                    <I.user size={10} /> {r.currentGuestName}
                    {r.checkoutOn && <span className="text-muted"> · → {r.checkoutOn}</span>}
                  </div>
                )}
                {r.stateNote && <div className="rt-note text-muted">&ldquo;{r.stateNote}&rdquo;</div>}
                <div className="rt-actions">
                  {SETTABLE.map((s) => {
                    const sm = STATES.find((x) => x.id === s)!;
                    const isCurrent = r.effectiveState === s;
                    return (
                      <button
                        key={s}
                        className={`btn xs ${isCurrent ? "primary" : "ghost"}`}
                        onClick={() => onSet(r, s)}
                        disabled={busy || pending || isCurrent}
                        title={lang === "ko" ? sm.ko : sm.en}
                      >
                        {sm.emoji}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <style>{`
        .page { padding: 20px 24px 32px; display: flex; flex-direction: column; gap: 16px; }
        .header h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 2px; color: var(--t-1); }
        .header .sub { font-size: 12px; }
        .alert { padding: 8px 12px; border-radius: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px; background: var(--bad-soft); color: var(--bad); }
        .counts { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
        .count-tile {
          padding: 12px; border-radius: 8px; border: 1px solid var(--bd-1);
          background: var(--bg-elev); display: flex; flex-direction: column;
          align-items: flex-start; gap: 4px; cursor: pointer; font: inherit;
          transition: border-color .12s, background .12s;
        }
        .count-tile:hover { border-color: var(--acc); }
        .count-tile.active { background: var(--acc-soft); border-color: var(--acc); }
        .count-tile .lbl { font-size: 11px; color: var(--t-2); font-weight: 500; }
        .count-tile .val { font-size: 22px; font-weight: 700; color: var(--t-1); font-variant-numeric: tabular-nums; }
        .count-tile.ok.active   { background: var(--ok-soft); border-color: var(--ok); }
        .count-tile.warn.active { background: var(--warn-soft); border-color: var(--warn); }
        .count-tile.info.active { background: var(--acc-soft); border-color: var(--acc); }
        .count-tile.bad.active  { background: var(--bad-soft); border-color: var(--bad); }
        .grid {
          padding: 12px 16px 16px; display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 10px;
        }
        .empty { padding: 32px; text-align: center; color: var(--t-3); font-size: 12px; grid-column: 1 / -1; }
        .room-tile {
          padding: 10px 12px; border-radius: 8px; border: 1px solid var(--bd-1);
          background: var(--bg-elev); display: flex; flex-direction: column; gap: 4px;
          border-left: 4px solid var(--bd-2);
        }
        .room-tile.ok   { border-left-color: var(--ok); }
        .room-tile.warn { border-left-color: var(--warn); }
        .room-tile.info { border-left-color: var(--acc); }
        .room-tile.bad  { border-left-color: var(--bad); }
        .rt-head { display: flex; justify-content: space-between; align-items: center; }
        .rt-head .num { font-weight: 700; font-size: 16px; color: var(--t-1); }
        .rt-type { font-size: 11px; }
        .rt-guest { font-size: 11px; color: var(--t-2); display: inline-flex; align-items: center; gap: 4px; }
        .rt-note { font-size: 11px; font-style: italic; }
        .rt-actions { display: flex; gap: 4px; margin-top: 6px; }
        .btn.xs { height: 24px; min-width: 28px; padding: 0 6px; font-size: 12px; }
        .pill { display: inline-flex; align-items: center; gap: 4px; padding: 1px 6px; border-radius: 999px; font-size: 10px; font-weight: 600; }
        .pill.ok    { background: var(--ok-soft); color: var(--ok); }
        .pill.warn  { background: var(--warn-soft); color: var(--warn); }
        .pill.info  { background: var(--acc-soft); color: var(--acc); }
        .pill.bad   { background: var(--bad-soft); color: var(--bad); }
      `}</style>
    </div>
  );
}
