"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { I } from "@/components/icons";
import { channelById } from "@/lib/i18n";
import type { BookingDetailRow } from "@/lib/queries";
import { issueCheckinToken, setBookingNotes, setBookingStatus, type BookingStatusAction } from "@/lib/actions";

function fmtDate(iso: string, lang: "ko" | "en" | "ja" | "zh"): string {
  return new Date(iso).toLocaleDateString(
    lang === "ko" ? "ko-KR" : lang === "ja" ? "ja-JP" : lang === "zh" ? "zh-CN" : "en-US",
    { year: "numeric", month: "short", day: "numeric" },
  );
}
function fmtClock(iso: string, lang: "ko" | "en" | "ja" | "zh"): string {
  return new Date(iso).toLocaleTimeString(
    lang === "ko" ? "ko-KR" : "en-US",
    { hour: "2-digit", minute: "2-digit" },
  );
}

export function BookingDetailClient({ detail }: { detail: BookingDetailRow }) {
  const { lang } = useApp();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState(detail.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<BookingStatusAction | null>(null);
  const [kioskUrl, setKioskUrl] = useState<string | null>(null);

  const onIssueKiosk = () => {
    setError(null);
    startTransition(async () => {
      const r = await issueCheckinToken(detail.id);
      if ("ok" in r && r.ok) {
        setKioskUrl(r.url);
        navigator.clipboard?.writeText(r.url).catch(() => undefined);
      } else if ("error" in r) {
        setError(r.error);
      }
    });
  };

  const ch = channelById(detail.channel);

  const onAction = (action: BookingStatusAction) => {
    setError(null);
    setPendingAction(action);
    startTransition(async () => {
      const r = await setBookingStatus(detail.id, action);
      setPendingAction(null);
      if ("ok" in r && r.ok) router.refresh();
      else if ("error" in r) setError(r.error);
    });
  };

  const onSaveNotes = () => {
    setError(null);
    startTransition(async () => {
      const r = await setBookingNotes(detail.id, notes);
      if ("ok" in r && r.ok) router.refresh();
      else if ("error" in r) setError(r.error);
    });
  };

  // Build a unified timeline: payments + audit events.
  const timeline = [...detail.auditLog].sort((a, b) => (a.at < b.at ? 1 : -1));
  const sharableUrl = typeof window !== "undefined" ? `${window.location.origin}/bookings/${detail.id}` : "";

  return (
    <div className="page">
      <div className="header">
        <Link href="/bookings" className="back-link text-muted">
          <I.arrowL size={11} /> {lang === "ko" ? "예약 목록" : "All bookings"}
        </Link>
        <div className="hero">
          <div className="hero-id">
            <span className="ref mono">#{detail.externalRef ?? detail.id.slice(-8).toUpperCase()}</span>
            <StatusPill s={detail.status} lang={lang} />
            <span className="mini-ch"><span className={`dot ${ch?.cls}`} />{ch?.name}</span>
            <span className="text-muted" style={{ fontSize: 12 }}>
              · {lang === "ko" ? "수신" : "Received"} {fmtDate(detail.createdAt, lang)} {fmtClock(detail.createdAt, lang)}
            </span>
          </div>
          <div className="hero-actions">
            {detail.threadId && (
              <Link className="btn sm ghost" href={`/messages?thread=${detail.threadId}`}>
                <I.msg size={11} /> {lang === "ko" ? `메시지 (${detail.threadMessageCount})` : `Messages (${detail.threadMessageCount})`}
              </Link>
            )}
            <Link className="btn sm ghost" href={`/guests/${detail.guest.id}`}>
              <I.user size={11} /> {lang === "ko" ? "게스트" : "Guest"}
            </Link>
            {sharableUrl && (
              <button
                className="btn sm ghost"
                title={lang === "ko" ? "URL 복사" : "Copy URL"}
                onClick={() => {
                  navigator.clipboard?.writeText(sharableUrl).catch(() => undefined);
                }}
              >
                <I.link size={11} /> {lang === "ko" ? "공유" : "Share"}
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="alert bad"><I.warn size={12} /> {error}</div>}

      <div className="grid">
        <section className="card">
          <div className="sec-h">
            <div className="title">{lang === "ko" ? "게스트 + 일정" : "Guest + stay"}</div>
          </div>
          <div className="kv">
            <div><span className="k">{lang === "ko" ? "게스트" : "Guest"}</span><span className="v">{detail.guest.flag} <Link href={`/guests/${detail.guest.id}`} style={{ color: "inherit" }}>{detail.guest.name}</Link></span></div>
            {detail.guest.email && <div><span className="k">Email</span><span className="v"><a href={`mailto:${detail.guest.email}`}>{detail.guest.email}</a></span></div>}
            {detail.guest.phone && <div><span className="k">{lang === "ko" ? "전화" : "Phone"}</span><span className="v">{detail.guest.phone}</span></div>}
            <div><span className="k">{lang === "ko" ? "객실" : "Room"}</span><span className="v">{detail.roomType.name}{detail.roomNumber ? ` · ${detail.roomNumber}` : ""}</span></div>
            <div><span className="k">{lang === "ko" ? "체크인" : "Check-in"}</span><span className="v">{fmtDate(detail.checkIn, lang)}</span></div>
            <div><span className="k">{lang === "ko" ? "체크아웃" : "Check-out"}</span><span className="v">{fmtDate(detail.checkOut, lang)} <span className="text-muted">({detail.nights}{lang === "ko" ? "박" : "n"})</span></span></div>
            <div><span className="k">{lang === "ko" ? "총액" : "Total"}</span><span className="v" style={{ fontWeight: 600 }}>₩{detail.total.toLocaleString()}</span></div>
            <div><span className="k">{lang === "ko" ? "결제" : "Payment"}</span><span className="v"><PaymentPill p={detail.payment} lang={lang} /></span></div>
          </div>
        </section>

        <section className="card">
          <div className="sec-h">
            <div className="title">{lang === "ko" ? "액션" : "Actions"}</div>
          </div>
          <div className="actions">
            {detail.status === "confirmed" && (
              <button className="btn primary" onClick={() => onAction("check_in")} disabled={pending}>
                <I.calCheck size={12} /> {pendingAction === "check_in" ? "…" : (lang === "ko" ? "체크인 처리" : "Check in")}
              </button>
            )}
            {detail.status === "in_house" && (
              <button className="btn primary" onClick={() => onAction("check_out")} disabled={pending}>
                <I.check size={12} /> {pendingAction === "check_out" ? "…" : (lang === "ko" ? "체크아웃 처리" : "Check out")}
              </button>
            )}
            {detail.payment === "pending" && detail.status !== "cancelled" && (
              <button className="btn" onClick={() => onAction("mark_paid")} disabled={pending}>
                <I.cc size={12} /> {pendingAction === "mark_paid" ? "…" : (lang === "ko" ? "결제 완료 처리" : "Mark paid")}
              </button>
            )}
            {detail.payment === "paid" && detail.status === "cancelled" && (
              <button className="btn" onClick={() => onAction("mark_refunded")} disabled={pending}>
                {pendingAction === "mark_refunded" ? "…" : (lang === "ko" ? "환불 처리" : "Mark refunded")}
              </button>
            )}
            {detail.status !== "cancelled" && detail.status !== "checked_out" && (
              <button className="btn ghost danger-btn" onClick={() => onAction("cancel")} disabled={pending}>
                {pendingAction === "cancel" ? "…" : (lang === "ko" ? "취소" : "Cancel booking")}
              </button>
            )}
            {detail.status !== "cancelled" && detail.status !== "checked_out" && (
              <button className="btn ghost" onClick={onIssueKiosk} disabled={pending} title={lang === "ko" ? "셀프 체크인 링크 발급 + 클립보드 복사" : "Generate kiosk link + copy"}>
                <I.zap size={11} /> {lang === "ko" ? "셀프 체크인 링크" : "Kiosk link"}
              </button>
            )}
          </div>
          {kioskUrl && (
            <div className="kiosk-url">
              <I.check size={11} />
              <span>{lang === "ko" ? "복사됨:" : "Copied:"}</span>
              <a href={kioskUrl} target="_blank" rel="noreferrer" className="mono">{kioskUrl}</a>
            </div>
          )}
        </section>

        <section className="card">
          <div className="sec-h">
            <div className="title">{lang === "ko" ? "결제 이력" : "Payment history"}</div>
          </div>
          {detail.paymentHistory.length === 0 ? (
            <div className="empty">{lang === "ko" ? "결제 이벤트 없음" : "No payment events yet"}</div>
          ) : (
            <ul className="ph-list">
              {detail.paymentHistory.map((p, i) => (
                <li key={i} className={`ph-row ph-${p.type}`}>
                  <span className="ph-time text-muted">{fmtDate(p.at, lang)} {fmtClock(p.at, lang)}</span>
                  <span className="ph-type">{p.type}</span>
                  <span className="ph-body text-muted">{p.body ?? "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="sec-h">
            <div className="title">{lang === "ko" ? "메모 + 게스트 요청" : "Notes + requests"}</div>
          </div>
          <div className="notes-body">
            {detail.requests.length > 0 && (
              <div className="reqs">
                {detail.requests.map((r, i) => (
                  <span key={i} className="pill info">{r.label}</span>
                ))}
              </div>
            )}
            <textarea
              value={notes}
              maxLength={1000}
              rows={4}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={lang === "ko" ? "운영 메모 (게스트에게 노출되지 않음)" : "Internal notes (never shown to guest)"}
              disabled={pending}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn sm" onClick={onSaveNotes} disabled={pending || (notes ?? "") === (detail.notes ?? "")}>
                {pending ? "…" : (lang === "ko" ? "메모 저장" : "Save notes")}
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="sec-h">
          <div className="title">{lang === "ko" ? "감사 로그" : "Audit log"}</div>
          <div className="sub">{detail.auditLog.length} {lang === "ko" ? "이벤트" : "events"}</div>
        </div>
        {timeline.length === 0 ? (
          <div className="empty">{lang === "ko" ? "이벤트 없음" : "No events yet"}</div>
        ) : (
          <ul className="al-list">
            {timeline.map((e) => (
              <li key={e.id}>
                <span className="al-time text-muted mono">{fmtDate(e.at, lang)} {fmtClock(e.at, lang)}</span>
                <span className="al-type">{e.type.replace(/_/g, " ")}</span>
                {e.body && <span className="al-body text-muted">{e.body}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <style>{`
        .page { padding: 20px 24px 32px; display: flex; flex-direction: column; gap: 16px; }
        .header { padding-bottom: 8px; }
        .back-link { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; text-decoration: none; }
        .hero { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 6px; flex-wrap: wrap; }
        .hero-id { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .ref { font-size: 18px; font-weight: 700; color: var(--t-1); letter-spacing: -0.02em; }
        .hero-actions { display: flex; gap: 6px; }
        .alert { padding: 8px 12px; border-radius: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px; background: var(--bad-soft); color: var(--bad); }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .kv { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 6px; }
        .kv > div { display: grid; grid-template-columns: 110px 1fr; gap: 12px; align-items: center; font-size: 13px; }
        .kv .k { color: var(--t-3); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500; }
        .kv .v { color: var(--t-1); }
        .kv a { color: var(--acc); text-decoration: none; }
        .actions { padding: 16px; display: flex; gap: 8px; flex-wrap: wrap; }
        .kiosk-url { padding: 8px 16px 14px; display: flex; gap: 6px; align-items: center; font-size: 11px; color: var(--ok); }
        .kiosk-url a { color: var(--acc); word-break: break-all; }
        .danger-btn { color: var(--bad); }
        .empty { padding: 24px; text-align: center; color: var(--t-3); font-size: 12px; }
        .ph-list { list-style: none; margin: 0; padding: 0; }
        .ph-row { display: grid; grid-template-columns: 140px 90px 1fr; gap: 10px; padding: 8px 16px; border-bottom: 1px solid var(--bd-1); font-size: 12px; align-items: center; }
        .ph-row:last-child { border-bottom: 0; }
        .ph-time { font-size: 11px; }
        .ph-type { font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 10px; }
        .ph-captured { border-left: 3px solid var(--ok); padding-left: 13px; }
        .ph-failed   { border-left: 3px solid var(--bad); padding-left: 13px; }
        .ph-refunded { border-left: 3px solid var(--warn); padding-left: 13px; }
        .ph-body { font-size: 11px; }
        .reqs { display: flex; gap: 6px; flex-wrap: wrap; padding: 8px 16px 0; }
        .reqs .pill { padding: 2px 8px; border-radius: 999px; font-size: 11px; }
        .reqs .pill.info { background: var(--acc-soft); color: var(--acc); }
        .notes-body { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 10px; }
        .notes-body textarea { padding: 8px 10px; border: 1px solid var(--bd-1); border-radius: 6px; background: var(--bg-elev); color: var(--t-1); font: inherit; font-size: 12px; line-height: 1.5; resize: vertical; }
        .al-list { list-style: none; padding: 0; margin: 0; }
        .al-list li { display: grid; grid-template-columns: 160px 140px 1fr; gap: 10px; padding: 8px 16px; border-bottom: 1px solid var(--bd-1); font-size: 12px; align-items: center; }
        .al-list li:last-child { border-bottom: 0; }
        .al-time { font-size: 11px; }
        .al-type { font-weight: 500; text-transform: capitalize; color: var(--t-1); }
        .al-body { font-size: 11px; word-break: break-all; }
        .mini-ch { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--t-2); font-weight: 500; }
        .mini-ch .dot { width: 8px; height: 8px; border-radius: 2px; flex: 0 0 8px; }
        .pill { padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; display: inline-flex; }
        .pill.ok    { background: var(--ok-soft); color: var(--ok); }
        .pill.warn  { background: var(--warn-soft); color: var(--warn); }
        .pill.bad   { background: var(--bad-soft); color: var(--bad); }
        .pill.info  { background: var(--acc-soft); color: var(--acc); }
      `}</style>
    </div>
  );
}

function StatusPill({ s, lang }: { s: BookingDetailRow["status"]; lang: "ko" | "en" | "ja" | "zh" }) {
  if (s === "confirmed") return <span className="pill ok">{lang === "ko" ? "확정" : "Confirmed"}</span>;
  if (s === "in_house") return <span className="pill info">{lang === "ko" ? "재실" : "In-house"}</span>;
  if (s === "cancelled") return <span className="pill bad">{lang === "ko" ? "취소" : "Cancelled"}</span>;
  return <span className="pill warn">{lang === "ko" ? "퇴실" : "Checked out"}</span>;
}

function PaymentPill({ p, lang }: { p: BookingDetailRow["payment"]; lang: "ko" | "en" | "ja" | "zh" }) {
  const m = {
    paid:     { ko: "결제 완료", en: "Paid",     cls: "ok" },
    pending:  { ko: "결제 대기", en: "Pending",  cls: "warn" },
    failed:   { ko: "결제 실패", en: "Failed",   cls: "bad" },
    refunded: { ko: "환불됨",   en: "Refunded", cls: "info" },
  } as const;
  const meta = m[p as keyof typeof m] ?? m.pending;
  return <span className={`pill ${meta.cls}`}>{lang === "ko" ? meta.ko : meta.en}</span>;
}
