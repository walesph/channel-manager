"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { I } from "./icons";
import { channelById, type Lang } from "@/lib/i18n";
import type { ActivityItem } from "@/lib/queries";
import { fetchRecentActivity } from "@/lib/actions";

function formatRelative(iso: string, lang: Lang): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return lang === "ko" ? "방금" : "just now";
  if (m < 60) return lang === "ko" ? `${m}분 전` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return lang === "ko" ? `${h}시간 전` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return lang === "ko" ? `${d}일 전` : `${d}d ago`;
}

interface Props {
  activity: ActivityItem[];
  lang: Lang;
}

export function NotificationsBell({ activity: initialActivity, lang }: Props) {
  const [open, setOpen] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>(initialActivity);
  const ref = useRef<HTMLDivElement | null>(null);

  // Reset to fresh server data whenever the prop changes (e.g. after router.refresh)
  useEffect(() => {
    setActivity(initialActivity);
  }, [initialActivity]);

  // Subscribe to /api/activity/stream via SSE for push updates. Falls back
  // to polling if EventSource is unavailable or the stream errors twice.
  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      // Polling fallback (legacy browsers / tests)
      const tick = async () => {
        try { setActivity(await fetchRecentActivity()); } catch {}
      };
      const id = setInterval(tick, 30_000);
      return () => clearInterval(id);
    }

    // Use the latest known event time as our cursor so a refresh + reconnect
    // doesn't re-emit items we already have.
    const since = activity[0]?.occurredAt ?? new Date().toISOString();
    const url = `/api/activity/stream?since=${encodeURIComponent(since)}`;

    let es: EventSource | null = null;
    let errCount = 0;
    let cancelled = false;

    const open = () => {
      if (cancelled) return;
      es = new EventSource(url);
      es.addEventListener("activity", (ev) => {
        try {
          const item = JSON.parse((ev as MessageEvent).data) as ActivityItem;
          // Prepend; keep at most 50 to avoid unbounded growth.
          setActivity((prev) => {
            // De-dupe by id (in case of reconnect overlap)
            if (prev.some((a) => a.id === item.id)) return prev;
            return [item, ...prev].slice(0, 50);
          });
        } catch {
          // ignore malformed frames
        }
      });
      es.addEventListener("error", () => {
        errCount++;
        if (errCount >= 3) {
          es?.close();
          // EventSource auto-reconnects on transient errors; only give up
          // after 3 consecutive failures and rely on the next page nav to
          // restart the stream.
        }
      });
    };
    open();

    return () => {
      cancelled = true;
      es?.close();
    };
    // Subscription is per-mount; we intentionally don't restart on every prop change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const recentCount = activity.filter((a) => a.recent).length;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="btn ghost icon"
        onClick={() => setOpen((v) => !v)}
        aria-label={lang === "ko" ? "알림" : "Notifications"}
        style={{ position: "relative" }}
      >
        <I.bell size={15} />
        {recentCount > 0 && <span className="bell-badge num">{recentCount > 9 ? "9+" : recentCount}</span>}
      </button>
      {open && (
        <div className="notif-pop">
          <div className="notif-head">
            <span style={{ fontWeight: 600, fontSize: 13 }}>{lang === "ko" ? "최근 활동" : "Recent activity"}</span>
            <span className="text-muted" style={{ fontSize: 11 }}>
              {recentCount > 0
                ? lang === "ko" ? `1시간 내 ${recentCount}건` : `${recentCount} in last hour`
                : lang === "ko" ? "최근 1시간 알림 없음" : "no items in last hour"}
            </span>
          </div>
          <div className="notif-list">
            {activity.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--t-3)", fontSize: 12 }}>
                {lang === "ko" ? "활동 없음" : "No activity yet"}
              </div>
            ) : (
              activity.map((a) => {
                const c = a.channel ? channelById(a.channel) : null;
                return (
                  <Link key={a.id} href={a.href} className="notif-row" onClick={() => setOpen(false)}>
                    <div className={`notif-ic kind-${a.kind}`}>
                      {a.kind === "booking_event" && <I.inbox size={12} />}
                      {a.kind === "sync_log" && <I.warn size={12} />}
                      {a.kind === "message" && <I.msg size={12} />}
                    </div>
                    <div className="notif-body">
                      <div className="notif-title">{a.title}</div>
                      {a.sub && <div className="notif-sub">{a.sub}</div>}
                      <div className="notif-meta">
                        {c && <span className="mini-ch"><span className={`dot ${c.cls}`} />{c.name}</span>}
                        <span className="text-muted">· {formatRelative(a.occurredAt, lang)}</span>
                        {a.recent && <span className="pill acc dot" style={{ height: 16, fontSize: 9, padding: "0 5px" }}>NEW</span>}
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      )}
      <style>{`
        .bell-badge {
          position: absolute; top: -2px; right: -2px;
          background: var(--bad); color: white;
          min-width: 14px; height: 14px;
          border-radius: 999px;
          font-size: 9px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          padding: 0 4px;
          border: 2px solid var(--bg);
        }
        .notif-pop {
          position: absolute; top: calc(100% + 6px); right: 0;
          width: 360px; max-height: 480px;
          background: var(--bg-elev);
          border: 1px solid var(--bd-2);
          border-radius: var(--r-md);
          box-shadow: var(--shadow-pop);
          z-index: 60;
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        .notif-head {
          display: flex; justify-content: space-between; align-items: center;
          padding: 12px 14px; border-bottom: 1px solid var(--bd-1);
        }
        .notif-list {
          overflow: auto;
          flex: 1;
        }
        .notif-row {
          display: flex; gap: 10px; padding: 10px 14px;
          border-bottom: 1px solid var(--bd-1);
          text-decoration: none;
          cursor: pointer;
        }
        .notif-row:hover { background: var(--bg-hover); }
        .notif-row:last-child { border-bottom: 0; }
        .notif-ic {
          width: 24px; height: 24px; border-radius: 999px;
          display: flex; align-items: center; justify-content: center;
          flex: 0 0 24px;
        }
        .notif-ic.kind-booking_event { background: var(--acc-soft); color: var(--acc-text); }
        .notif-ic.kind-sync_log { background: var(--warn-soft); color: var(--warn); }
        .notif-ic.kind-message { background: var(--info-soft); color: var(--info); }
        .notif-body { flex: 1; min-width: 0; }
        .notif-title { font-size: 12px; font-weight: 600; color: var(--t-1); }
        .notif-sub { font-size: 11px; color: var(--t-3); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .notif-meta { display: flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 10px; }
        .mini-ch { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; color: var(--t-2); font-weight: 500;}
        .mini-ch .dot { width: 6px; height: 6px; border-radius: 1px; flex: 0 0 6px;}
      `}</style>
    </div>
  );
}
