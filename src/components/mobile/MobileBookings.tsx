"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { I } from "../icons";
import { CHANNELS, channelById, type ChannelId, type Lang } from "@/lib/i18n";
import type { BookingRow, RoomTypeOption } from "@/lib/queries";
import type { BookingStatus, PaymentStatus } from "@prisma/client";
import { issueCheckinToken, setBookingStatus, type BookingStatusAction } from "@/lib/actions";
import { MobileNewBookingSheet } from "./MobileNewBookingSheet";
import { MobileTabBar } from "./MobileTabBar";

type FilterKey = "all" | "confirmed" | "in_house" | "cancelled";

interface OptimisticPatch {
  id: string;
  status?: BookingStatus;
  payment?: PaymentStatus;
}

function predictNext(b: BookingRow, action: BookingStatusAction): OptimisticPatch | null {
  switch (action) {
    case "check_in":
      return b.status === "confirmed" ? { id: b.id, status: "in_house" } : null;
    case "check_out":
      return b.status === "in_house" ? { id: b.id, status: "checked_out" } : null;
    case "cancel":
      if (b.status === "cancelled" || b.status === "checked_out") return null;
      return { id: b.id, status: "cancelled", payment: b.payment === "paid" ? "refunded" : b.payment };
    case "mark_paid":
      return b.payment !== "paid" ? { id: b.id, payment: "paid" } : null;
    case "mark_refunded":
      return b.payment === "paid" ? { id: b.id, payment: "refunded" } : null;
  }
}

function formatMd(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

const StatusPill = ({ s, lang }: { s: BookingStatus; lang: Lang }) => {
  if (s === "confirmed") return <span className="pill ok dot" style={{ height: 18, fontSize: 10 }}>{lang === "ko" ? "확정" : "Confirmed"}</span>;
  if (s === "in_house") return <span className="pill info dot" style={{ height: 18, fontSize: 10 }}>{lang === "ko" ? "재실" : "In-house"}</span>;
  if (s === "cancelled") return <span className="pill bad dot" style={{ height: 18, fontSize: 10 }}>{lang === "ko" ? "취소" : "Cancelled"}</span>;
  return <span className="pill warn dot" style={{ height: 18, fontSize: 10 }}>{lang === "ko" ? "퇴실" : "Checked out"}</span>;
};

interface Props {
  lang: Lang;
  bookings: BookingRow[];
  roomTypeOptions: RoomTypeOption[];
}

export function MobileBookings({ lang, bookings, roomTypeOptions }: Props) {
  const router = useRouter();
  const [optimisticBookings, addOptimistic] = useOptimistic(bookings, (state, patch: OptimisticPatch) =>
    state.map((b) => (b.id === patch.id ? { ...b, status: patch.status ?? b.status, payment: patch.payment ?? b.payment } : b)),
  );
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<ChannelId | "all">("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | "all">("all");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<BookingStatusAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [kioskUrl, setKioskUrl] = useState<string | null>(null);
  const [issuingKiosk, setIssuingKiosk] = useState(false);

  const runAction = (b: BookingRow, action: BookingStatusAction) => {
    setActionError(null);
    setPendingAction(action);
    const patch = predictNext(b, action);
    startTransition(async () => {
      if (patch) addOptimistic(patch);
      const r = await setBookingStatus(b.id, action);
      setPendingAction(null);
      if (!r.ok) setActionError(r.error);
      else router.refresh();
    });
  };

  const onIssueKiosk = (b: BookingRow) => {
    setActionError(null);
    setIssuingKiosk(true);
    setKioskUrl(null);
    startTransition(async () => {
      const r = await issueCheckinToken(b.id);
      setIssuingKiosk(false);
      if ("ok" in r && r.ok) {
        setKioskUrl(r.url);
        // Phone-friendly: try Web Share API first, fall back to clipboard.
        const shareData = { title: "Stayboard check-in", url: r.url, text: "Self check-in link" };
        if (navigator.share && navigator.canShare?.(shareData)) {
          navigator.share(shareData).catch(() => undefined);
        } else {
          navigator.clipboard?.writeText(r.url).catch(() => undefined);
        }
      } else if ("error" in r) {
        setActionError(r.error);
      }
    });
  };

  const trimmed = query.trim().toLowerCase();
  const displayed = optimisticBookings.filter((b) => {
    if (filter !== "all" && b.status !== filter) return false;
    if (channelFilter !== "all" && b.channel !== channelFilter) return false;
    if (paymentFilter !== "all" && b.payment !== paymentFilter) return false;
    if (!trimmed) return true;
    return (
      b.guest.name.toLowerCase().includes(trimmed) ||
      (b.externalRef?.toLowerCase().includes(trimmed) ?? false) ||
      b.roomType.name.toLowerCase().includes(trimmed)
    );
  });

  const advancedActive = (channelFilter !== "all" ? 1 : 0) + (paymentFilter !== "all" ? 1 : 0);

  const opened = openId ? optimisticBookings.find((b) => b.id === openId) : null;

  return (
    <div className="m-screen" style={{ padding: 0 }}>
      <div className="m-bk-head">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px 8px" }}>
          <div className="m-title" style={{ fontSize: 20 }}>{lang === "ko" ? "예약" : "Bookings"}</div>
          <span className="text-muted" style={{ fontSize: 12 }}>{displayed.length}{lang === "ko" ? "건" : ""}</span>
        </div>
        <div className="m-search">
          <I.search size={14} />
          <input
            placeholder={lang === "ko" ? "이름, 예약번호…" : "Name, ref…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className={`btn sm ${advancedActive > 0 || advancedOpen ? "primary" : "ghost"}`}
            onClick={() => setAdvancedOpen((v) => !v)}
            style={{ height: 28, padding: "0 8px" }}
          >
            <I.filter size={12} />
            {advancedActive > 0 && <span className="num" style={{ marginLeft: 2, fontSize: 10 }}>{advancedActive}</span>}
          </button>
        </div>
        {advancedOpen && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: "0 16px 8px" }}>
            <select className="input" value={channelFilter} onChange={(e) => setChannelFilter(e.target.value as ChannelId | "all")} style={{ height: 32, fontSize: 12 }}>
              <option value="all">{lang === "ko" ? "모든 채널" : "All channels"}</option>
              {CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="input" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as PaymentStatus | "all")} style={{ height: 32, fontSize: 12 }}>
              <option value="all">{lang === "ko" ? "모든 결제" : "All payment"}</option>
              <option value="paid">{lang === "ko" ? "완료" : "Paid"}</option>
              <option value="pending">{lang === "ko" ? "대기" : "Pending"}</option>
              <option value="failed">{lang === "ko" ? "실패" : "Failed"}</option>
              <option value="refunded">{lang === "ko" ? "환불" : "Refunded"}</option>
            </select>
          </div>
        )}
        <div className="m-chips">
          {(["all", "confirmed", "in_house", "cancelled"] as FilterKey[]).map((f) => (
            <button
              key={f}
              className={`m-chip ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" && (lang === "ko" ? "모두" : "All")}
              {f === "confirmed" && (lang === "ko" ? "확정" : "Confirmed")}
              {f === "in_house" && (lang === "ko" ? "재실" : "In-house")}
              {f === "cancelled" && (lang === "ko" ? "취소" : "Cancelled")}
            </button>
          ))}
        </div>
      </div>

      <div className="m-bk-list">
        {displayed.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--t-3)", fontSize: 13 }}>
            {lang === "ko" ? "조건에 맞는 예약이 없습니다." : "No bookings match."}
          </div>
        ) : (
          displayed.map((b) => {
            const c = channelById(b.channel)!;
            return (
              <button key={b.id} className="m-bk-card" onClick={() => setOpenId(b.id)}>
                <div className="m-bk-top">
                  <div className="m-bk-name">
                    <span style={{ fontSize: 16 }}>{b.guest.flag}</span>
                    {b.guest.name}
                  </div>
                  <div className="num" style={{ fontWeight: 600 }}>₩{(b.total / 1000).toLocaleString()}K</div>
                </div>
                <div className="m-bk-mid">
                  <span className="mini-ch"><span className={`dot ${c.cls}`} />{c.name}</span>
                  <span className="text-muted">·</span>
                  <span className="text-muted">{b.roomType.name}</span>
                </div>
                <div className="m-bk-bot">
                  <span className="num">{formatMd(b.checkIn)} → {formatMd(b.checkOut)}</span>
                  <span className="text-muted">· {b.nights}{lang === "ko" ? "박" : "n"}</span>
                  <StatusPill s={b.status} lang={lang} />
                </div>
              </button>
            );
          })
        )}
      </div>

      <button className="m-fab" onClick={() => setNewOpen(true)} aria-label="new">
        <I.plus size={22} />
      </button>

      <MobileNewBookingSheet lang={lang} open={newOpen} onClose={() => setNewOpen(false)} roomTypes={roomTypeOptions} />

      {opened && (
        <div className="m-sheet">
          <div className="m-sheet-head">
            <button className="btn ghost" onClick={() => { setOpenId(null); setKioskUrl(null); }} style={{ height: 36 }}>
              <I.chevL size={16} /> {lang === "ko" ? "뒤로" : "Back"}
            </button>
            <div style={{ flex: 1, fontWeight: 600, fontSize: 14, textAlign: "center" }}>
              {opened.externalRef ?? opened.id.slice(-8).toUpperCase()}
            </div>
            <Link href={`/bookings/${opened.id}`} className="btn ghost" style={{ height: 36 }}>
              <I.external size={14} />
            </Link>
          </div>

          <div className="m-sheet-body">
            {actionError && <div className="m-err">{actionError}</div>}

            <div className="m-detail-card">
              <div className="m-detail-name">
                <span style={{ fontSize: 22 }}>{opened.guest.flag}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{opened.guest.name}</div>
                  {opened.guest.email && (
                    <div className="text-muted" style={{ fontSize: 11 }}>{opened.guest.email}</div>
                  )}
                </div>
                <div style={{ marginLeft: "auto" }}>
                  <StatusPill s={opened.status} lang={lang} />
                </div>
              </div>
            </div>

            <div className="m-detail-card">
              <div className="m-detail-row"><span>{lang === "ko" ? "체크인" : "Check-in"}</span><span className="num">{formatMd(opened.checkIn)}</span></div>
              <div className="m-detail-row"><span>{lang === "ko" ? "체크아웃" : "Check-out"}</span><span className="num">{formatMd(opened.checkOut)}</span></div>
              <div className="m-detail-row"><span>{lang === "ko" ? "박수" : "Nights"}</span><span className="num">{opened.nights}</span></div>
              <div className="m-detail-row"><span>{lang === "ko" ? "객실" : "Room"}</span><span>{opened.roomType.name}{opened.roomNumber ? ` · ${opened.roomNumber}` : ""}</span></div>
              <div className="m-detail-row">
                <span>{lang === "ko" ? "채널" : "Channel"}</span>
                <span className="mini-ch"><span className={`dot ${channelById(opened.channel)?.cls}`} />{channelById(opened.channel)?.name}</span>
              </div>
              <div className="m-detail-row" style={{ borderTop: "1px solid var(--bd-1)", paddingTop: 8, marginTop: 4 }}>
                <span style={{ fontWeight: 600 }}>{lang === "ko" ? "총액" : "Total"}</span>
                <span className="num" style={{ fontWeight: 600 }}>₩{opened.total.toLocaleString()}</span>
              </div>
              <div className="m-detail-row">
                <span>{lang === "ko" ? "결제" : "Payment"}</span>
                <span className={`pill ${opened.payment === "paid" ? "ok" : opened.payment === "refunded" ? "warn" : "bad"}`} style={{ height: 18, fontSize: 10 }}>
                  {opened.payment === "paid" && (lang === "ko" ? "완료" : "Paid")}
                  {opened.payment === "pending" && (lang === "ko" ? "대기" : "Pending")}
                  {opened.payment === "failed" && (lang === "ko" ? "실패" : "Failed")}
                  {opened.payment === "refunded" && (lang === "ko" ? "환불" : "Refunded")}
                </span>
              </div>
            </div>

            {opened.requests.length > 0 && (
              <div className="m-detail-card">
                <div className="m-detail-h">{lang === "ko" ? "특별 요청" : "Special requests"}</div>
                {opened.requests.map((r, i) => (
                  <div key={i} className="m-detail-row"><span>·</span><span style={{ flex: 1 }}>{r.label}</span></div>
                ))}
              </div>
            )}

            <div className="m-action-grid">
              {opened.status === "confirmed" && (
                <button className="btn primary lg" onClick={() => runAction(opened, "check_in")} disabled={!!pendingAction}>
                  <I.calCheck size={14} /> {pendingAction === "check_in" ? "…" : lang === "ko" ? "체크인" : "Check in"}
                </button>
              )}
              {opened.status === "in_house" && (
                <button className="btn primary lg" onClick={() => runAction(opened, "check_out")} disabled={!!pendingAction}>
                  <I.check size={14} /> {pendingAction === "check_out" ? "…" : lang === "ko" ? "체크아웃" : "Check out"}
                </button>
              )}
              {opened.payment === "pending" && opened.status !== "cancelled" && (
                <button className="btn lg" onClick={() => runAction(opened, "mark_paid")} disabled={!!pendingAction}>
                  <I.cc size={14} /> {pendingAction === "mark_paid" ? "…" : lang === "ko" ? "결제 완료" : "Mark paid"}
                </button>
              )}
              {opened.payment === "paid" && opened.status !== "cancelled" && (
                <button className="btn ghost lg" onClick={() => runAction(opened, "mark_refunded")} disabled={!!pendingAction}>
                  <I.refresh size={14} /> {pendingAction === "mark_refunded" ? "…" : lang === "ko" ? "환불" : "Refund"}
                </button>
              )}
              {opened.status !== "cancelled" && opened.status !== "checked_out" && (
                <button className="btn ghost lg" onClick={() => runAction(opened, "cancel")} disabled={!!pendingAction}>
                  <I.close size={14} /> {pendingAction === "cancel" ? "…" : lang === "ko" ? "취소" : "Cancel"}
                </button>
              )}
              {opened.status !== "cancelled" && opened.status !== "checked_out" && (
                <button className="btn ghost lg" onClick={() => onIssueKiosk(opened)} disabled={issuingKiosk}>
                  <I.zap size={14} /> {issuingKiosk ? "…" : (lang === "ko" ? "셀프 체크인 링크" : "Kiosk link")}
                </button>
              )}
            </div>

            {kioskUrl && (
              <div className="m-kiosk-url">
                <I.check size={11} />
                <span>{lang === "ko" ? "공유됨:" : "Shared:"}</span>
                <a href={kioskUrl} target="_blank" rel="noreferrer" className="mono">{kioskUrl}</a>
              </div>
            )}
          </div>
        </div>
      )}

      <MobileTabBar lang={lang} />

      <style>{`
        .m-screen { background: var(--bg-1); height: 100vh; overflow: hidden; display: flex; flex-direction: column; position: relative;}
        .m-title { font-size: 22px; font-weight: 600; color: var(--t-1); letter-spacing: -0.01em;}
        .m-bk-head { background: var(--bg-elev); border-bottom: 1px solid var(--bd-1); padding-bottom: 8px;}
        .m-search { display: flex; align-items: center; gap: 6px; margin: 0 16px 8px; padding: 0 10px; height: 36px; background: var(--bg-mute); border-radius: var(--r-sm); color: var(--t-3);}
        .m-search input { flex: 1; border: 0; background: transparent; outline: none; font: inherit; font-size: 13px; color: var(--t-1); }
        .m-chips { display: flex; gap: 4px; padding: 0 12px 4px; overflow-x: auto;}
        .m-chip { border: 1px solid var(--bd-1); background: var(--bg); padding: 6px 12px; font: inherit; font-size: 12px; color: var(--t-2); border-radius: 999px; cursor: pointer; white-space: nowrap;}
        .m-chip.active { background: var(--acc); color: white; border-color: var(--acc);}

        .m-bk-list { flex: 1; overflow: auto; padding: 8px 12px 80px;}
        .m-bk-card {
          width: 100%; text-align: left;
          background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: var(--r-md);
          padding: 12px 14px; margin-bottom: 8px;
          display: flex; flex-direction: column; gap: 6px;
          font: inherit; cursor: pointer;
        }
        .m-bk-card:active { background: var(--bg-hover);}
        .m-bk-top { display: flex; justify-content: space-between; align-items: center;}
        .m-bk-name { font-size: 14px; font-weight: 600; color: var(--t-1); display: inline-flex; align-items: center; gap: 6px;}
        .m-bk-mid { font-size: 11px; color: var(--t-2); display: flex; align-items: center; gap: 5px;}
        .m-bk-bot { font-size: 11px; color: var(--t-2); display: flex; align-items: center; gap: 6px;}
        .mini-ch { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--t-2);}
        .mini-ch .dot { width: 6px; height: 6px; border-radius: 1px; flex: 0 0 6px;}

        .m-fab { position: fixed; right: 18px; bottom: 80px; width: 52px; height: 52px; border-radius: 999px; background: var(--acc); color: white; border: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 16px rgba(79,70,229,0.35); z-index: 50;}
        .m-fab:active { transform: scale(0.96);}

        .m-sheet { position: fixed; inset: 0; background: var(--bg-1); z-index: 200; display: flex; flex-direction: column;}
        .m-sheet-head { display: flex; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--bd-1); background: var(--bg-elev);}
        .m-sheet-body { flex: 1; overflow: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px;}
        .m-detail-card { background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: var(--r-md); padding: 12px 14px; display: flex; flex-direction: column; gap: 6px;}
        .m-detail-h { font-size: 11px; color: var(--t-3); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px;}
        .m-detail-name { display: flex; align-items: center; gap: 10px;}
        .m-detail-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 13px;}
        .m-detail-row > span:first-child { color: var(--t-3);}
        .m-action-grid { display: grid; grid-template-columns: 1fr; gap: 8px;}
        .m-err { font-size: 12px; color: var(--bad); background: var(--bad-soft); padding: 8px 10px; border-radius: var(--r-sm);}
        .m-kiosk-url { display: flex; gap: 6px; align-items: center; font-size: 11px; color: var(--ok); padding: 8px 12px; background: var(--ok-soft); border-radius: var(--r-sm); }
        .m-kiosk-url a { color: var(--acc); word-break: break-all; }
        .mono { font-family: monospace; }
      `}</style>
    </div>
  );
}
