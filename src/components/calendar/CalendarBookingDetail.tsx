"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { I } from "../icons";
import { channelById, type Lang } from "@/lib/i18n";
import type { CalendarBookingSpan } from "@/lib/queries";
import type { BookingStatus, PaymentStatus } from "@prisma/client";
import { setBookingStatus, type BookingStatusAction } from "@/lib/actions";

interface Props {
  lang: Lang;
  span: CalendarBookingSpan | null;
  onClose: () => void;
}

const StatusPill = ({ s, lang }: { s: BookingStatus; lang: Lang }) => {
  if (s === "confirmed") return <span className="pill ok dot">{lang === "ko" ? "확정" : "Confirmed"}</span>;
  if (s === "in_house") return <span className="pill info dot">{lang === "ko" ? "재실" : "In-house"}</span>;
  if (s === "cancelled") return <span className="pill bad dot">{lang === "ko" ? "취소" : "Cancelled"}</span>;
  return <span className="pill warn dot">{lang === "ko" ? "퇴실" : "Checked out"}</span>;
};

function formatLong(iso: string, lang: Lang): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const m = d.getUTCMonth() + 1;
  const dom = d.getUTCDate();
  const dow = d.getUTCDay();
  const dowKo = ["일", "월", "화", "수", "목", "금", "토"][dow];
  const dowEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow];
  return lang === "ko" ? `${m}월 ${dom}일 (${dowKo})` : `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()]} ${dom} (${dowEn})`;
}

export function CalendarBookingDetail({ lang, span, onClose }: Props) {
  const router = useRouter();
  const [optimisticStatus, setOptimisticStatus] = useState<BookingStatus | null>(null);
  const [optimisticPayment, setOptimisticPayment] = useState<PaymentStatus | null>(null);
  const [pendingAction, setPendingAction] = useState<BookingStatusAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (!span) return null;
  const ch = channelById(span.channel)!;
  const status = optimisticStatus ?? span.status;
  const payment = optimisticPayment ?? span.payment;
  const nights = Math.max(1, Math.round((new Date(span.checkOut).getTime() - new Date(span.checkIn).getTime()) / 86_400_000));

  const runAction = (action: BookingStatusAction) => {
    setError(null);
    setPendingAction(action);
    // optimistic predict
    if (action === "check_in") setOptimisticStatus("in_house");
    if (action === "check_out") setOptimisticStatus("checked_out");
    if (action === "cancel") {
      setOptimisticStatus("cancelled");
      if (payment === "paid") setOptimisticPayment("refunded");
    }
    if (action === "mark_paid") setOptimisticPayment("paid");
    if (action === "mark_refunded") setOptimisticPayment("refunded");

    startTransition(async () => {
      const r = await setBookingStatus(span.bookingId, action);
      setPendingAction(null);
      if (!r.ok) {
        setError(r.error);
        setOptimisticStatus(null);
        setOptimisticPayment(null);
        return;
      }
      router.refresh();
      // Close after success — router.refresh will rebuild grid with new state
      setTimeout(() => onClose(), 600);
    });
  };

  return (
    <div className="cal-modal-bg" onClick={onClose}>
      <div className="cal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cal-modal-head">
          <div className="head-left">
            <div className="head-id">
              <span className="bd-num mono">#{span.externalRef ?? span.bookingId.slice(-8).toUpperCase()}</span>
              <StatusPill s={status} lang={lang} />
            </div>
            <div className="head-meta">
              <span className="mini-ch"><span className={`dot ${ch.cls}`} />{ch.name}</span>
              <span className="text-muted">·</span>
              <span className="text-muted">{span.roomTypeName}</span>
            </div>
          </div>
          <button className="btn ghost icon" onClick={onClose}><I.close size={14} /></button>
        </div>

        <div className="cal-modal-body">
          <div className="guest-block">
            <div className="g-avatar">{span.name.charAt(0)}</div>
            <div>
              <div className="g-name">
                {span.name} <span className="flag">{span.guestFlag}</span>
              </div>
              <div className="text-muted" style={{ fontSize: 11 }}>{nights} {lang === "ko" ? "박" : "nights"}</div>
              {(span.guestLifetime.bookingsCount >= 2 || span.guestLifetime.lifetimeRevenue > span.total) && (
                <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                  {span.guestLifetime.bookingsCount >= 2 && (
                    <span className="pill acc dot" style={{ height: 18, fontSize: 10 }}>
                      {lang === "ko" ? `재방문 ${span.guestLifetime.bookingsCount}회` : `${span.guestLifetime.bookingsCount} stays`}
                    </span>
                  )}
                  {span.guestLifetime.lifetimeRevenue > 0 && (
                    <span className="pill" style={{ height: 18, fontSize: 10 }}>
                      {lang === "ko" ? "누적" : "LTV"} ₩{(span.guestLifetime.lifetimeRevenue / 1000).toLocaleString()}K
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="dates-row">
            <div>
              <div className="lbl tracker">{lang === "ko" ? "체크인" : "Check-in"}</div>
              <div className="day num">{formatLong(span.checkIn, lang)}</div>
            </div>
            <I.arrowR size={14} style={{ color: "var(--t-3)" }} />
            <div>
              <div className="lbl tracker">{lang === "ko" ? "체크아웃" : "Check-out"}</div>
              <div className="day num">{formatLong(span.checkOut, lang)}</div>
            </div>
          </div>

          <div className="totals">
            <div className="totals-row">
              <span>{lang === "ko" ? "총액" : "Total"}</span>
              <span className="num" style={{ fontWeight: 600 }}>₩{span.total.toLocaleString()}</span>
            </div>
            <div className="totals-row">
              <span>{lang === "ko" ? "결제" : "Payment"}</span>
              <span className={`pill ${payment === "paid" ? "ok" : payment === "refunded" ? "warn" : "bad"}`}>
                {payment === "paid" && (lang === "ko" ? "결제 완료" : "Paid")}
                {payment === "pending" && (lang === "ko" ? "대기" : "Pending")}
                {payment === "failed" && (lang === "ko" ? "실패" : "Failed")}
                {payment === "refunded" && (lang === "ko" ? "환불됨" : "Refunded")}
              </span>
            </div>
          </div>

          {error && <div className="cal-err">{error}</div>}
        </div>

        <div className="cal-modal-foot">
          {status === "confirmed" && (
            <button className="btn primary" onClick={() => runAction("check_in")} disabled={!!pendingAction}>
              <I.calCheck size={12} /> {pendingAction === "check_in" ? "…" : lang === "ko" ? "체크인" : "Check in"}
            </button>
          )}
          {status === "in_house" && (
            <button className="btn primary" onClick={() => runAction("check_out")} disabled={!!pendingAction}>
              <I.check size={12} /> {pendingAction === "check_out" ? "…" : lang === "ko" ? "체크아웃" : "Check out"}
            </button>
          )}
          {payment === "pending" && status !== "cancelled" && (
            <button className="btn" onClick={() => runAction("mark_paid")} disabled={!!pendingAction}>
              <I.cc size={12} /> {pendingAction === "mark_paid" ? "…" : lang === "ko" ? "결제 완료" : "Mark paid"}
            </button>
          )}
          {payment === "paid" && status !== "cancelled" && (
            <button className="btn ghost" onClick={() => runAction("mark_refunded")} disabled={!!pendingAction}>
              <I.refresh size={12} /> {pendingAction === "mark_refunded" ? "…" : lang === "ko" ? "환불" : "Refund"}
            </button>
          )}
          {status !== "cancelled" && status !== "checked_out" && (
            <button className="btn ghost" onClick={() => runAction("cancel")} disabled={!!pendingAction}>
              <I.close size={12} /> {pendingAction === "cancel" ? "…" : lang === "ko" ? "취소" : "Cancel"}
            </button>
          )}
          {span.threadId && (
            <a href={`/messages?thread=${span.threadId}`} className="btn ghost">
              <I.msg size={12} /> {lang === "ko" ? "메시지" : "Message"}
            </a>
          )}
          <Link href={`/bookings/${span.bookingId}`} className="btn ghost">
            <I.external size={12} /> {lang === "ko" ? "전체 보기" : "Full detail"}
          </Link>
        </div>

        <style>{`
          .cal-modal-bg { position: fixed; inset: 0; background: rgba(15,15,20,0.4); display: flex; align-items: center; justify-content: center; z-index: 100;}
          .cal-modal { width: 480px; max-width: calc(100vw - 32px); background: var(--bg-elev); border: 1px solid var(--bd-2); border-radius: var(--r-lg); box-shadow: var(--shadow-pop); overflow: hidden; display: flex; flex-direction: column;}
          .cal-modal-head { display: flex; justify-content: space-between; align-items: flex-start; padding: 14px 18px 10px; border-bottom: 1px solid var(--bd-1);}
          .head-left { display: flex; flex-direction: column; gap: 6px; }
          .head-id { display: flex; align-items: center; gap: 8px; }
          .bd-num { font-size: 13px; color: var(--t-2); font-weight: 600;}
          .head-meta { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--t-3); }
          .mini-ch { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--t-2); font-weight: 500;}
          .mini-ch .dot { width: 7px; height: 7px; border-radius: 2px; flex: 0 0 7px;}
          .cal-modal-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 14px;}
          .guest-block { display: flex; gap: 12px; align-items: center; }
          .g-avatar { width: 40px; height: 40px; border-radius: 999px; background: linear-gradient(135deg, #fcd34d, #f59e0b); color: #78350f; font-weight: 700; font-size: 16px; display: flex; align-items: center; justify-content: center; flex: 0 0 40px;}
          .g-name { font-size: 16px; font-weight: 600; color: var(--t-1);}
          .dates-row { display: flex; align-items: center; gap: 16px; padding: 12px 14px; background: var(--bg-1); border: 1px solid var(--bd-1); border-radius: var(--r-md);}
          .dates-row .lbl { font-size: 10px; color: var(--t-3); margin-bottom: 2px;}
          .dates-row .day { font-size: 14px; font-weight: 600; color: var(--t-1); }
          .totals { display: flex; flex-direction: column; gap: 6px;}
          .totals-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--t-2);}
          .cal-err { font-size: 12px; color: var(--bad); background: var(--bad-soft); padding: 8px 10px; border-radius: var(--r-sm);}
          .cal-modal-foot { display: flex; gap: 6px; padding: 12px 18px; border-top: 1px solid var(--bd-1); background: var(--bg-1); flex-wrap: wrap;}
        `}</style>
      </div>
    </div>
  );
}
