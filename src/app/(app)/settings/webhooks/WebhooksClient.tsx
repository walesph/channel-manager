"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useApp } from "@/lib/app-context";
import { I } from "@/components/icons";
import type { WebhookLogDetail, WebhookLogRow, WebhookProviderStr, WebhookStatusStr } from "@/lib/queries";
import { fetchWebhookLogDetail, replayWebhook } from "@/lib/actions";

const PROVIDER_LABEL: Record<WebhookProviderStr, string> = {
  clerk: "Clerk",
  stripe: "Stripe",
  booking_com: "Booking.com",
  hostaway: "Hostaway",
};

const STATUS_PILL: Record<WebhookStatusStr, { cls: string; ko: string; en: string }> = {
  ok: { cls: "ok", ko: "정상", en: "OK" },
  invalid_signature: { cls: "bad", ko: "서명 오류", en: "Bad sig" },
  bad_request: { cls: "warn", ko: "잘못된 요청", en: "Bad req" },
  handler_error: { cls: "bad", ko: "핸들러 오류", en: "Handler" },
};

function fmtClock(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export function WebhooksClient({ logs }: { logs: WebhookLogRow[] }) {
  const { lang } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WebhookLogDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const open = (id: string) => {
    setOpenId(id);
    setDetail(null);
    setLoadingDetail(true);
    fetchWebhookLogDetail(id)
      .then((d) => setDetail(d))
      .finally(() => setLoadingDetail(false));
  };
  const close = () => {
    setOpenId(null);
    setDetail(null);
  };

  return (
    <div className="page">
      <div className="header">
        <Link href="/settings" className="back-link text-muted">
          <I.arrowL size={11} /> {lang === "ko" ? "설정" : "Settings"}
        </Link>
        <h1>{lang === "ko" ? "Webhook 로그" : "Webhook log"}</h1>
        <div className="sub text-muted">
          {lang === "ko"
            ? "Clerk, Stripe, Booking.com, Hostaway에서 받은 이벤트 — 클릭으로 상세보기 / 재처리"
            : "Inbound events from Clerk, Stripe, Booking.com, Hostaway — click for detail / replay"}
        </div>
      </div>

      <section className="card">
        <div className="sec-h">
          <div>
            <div className="title">{lang === "ko" ? "최근 100건" : "Last 100"}</div>
            <div className="sub">
              {logs.length} {lang === "ko" ? "이벤트" : "events"}
            </div>
          </div>
        </div>
        {logs.length === 0 ? (
          <div className="empty">
            {lang === "ko"
              ? "수신된 webhook이 없습니다. Clerk/Stripe/Booking.com에서 이벤트가 도착하면 여기에 표시됩니다."
              : "No webhooks received yet. Events from Clerk/Stripe/Booking.com will appear here."}
          </div>
        ) : (
          <table className="t-list">
            <thead>
              <tr>
                <th>{lang === "ko" ? "시각" : "Time"}</th>
                <th>{lang === "ko" ? "출처" : "Provider"}</th>
                <th>{lang === "ko" ? "이벤트" : "Event"}</th>
                <th>{lang === "ko" ? "상태" : "Status"}</th>
                <th className="r">HTTP</th>
                <th className="r">{lang === "ko" ? "소요" : "Duration"}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => {
                const sp = STATUS_PILL[row.status];
                return (
                  <tr
                    key={row.id}
                    className={`hook-row ${openId === row.id ? "open" : ""}`}
                    onClick={() => open(row.id)}
                  >
                    <td className="text-muted" style={{ fontSize: 11, fontFamily: "monospace" }}>{fmtClock(row.receivedAt)}</td>
                    <td style={{ fontWeight: 500 }}>{PROVIDER_LABEL[row.provider]}</td>
                    <td className="text-muted" style={{ fontSize: 12 }}>{row.eventType ?? "—"}</td>
                    <td><span className={`pill ${sp.cls}`}>{lang === "ko" ? sp.ko : sp.en}</span></td>
                    <td className="r num text-muted">{row.httpStatus}</td>
                    <td className="r num text-muted">{row.durationMs}ms</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {openId && (
        <DetailDrawer
          lang={lang}
          loading={loadingDetail}
          detail={detail}
          onClose={close}
        />
      )}

      <style>{`
        .page { padding: 20px 24px 32px; display: flex; flex-direction: column; gap: 16px; }
        .header h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin: 6px 0 2px; color: var(--t-1); }
        .header .sub { font-size: 12px; }
        .back-link { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; text-decoration: none; }
        .empty { padding: 32px; text-align: center; color: var(--t-3); font-size: 13px; }
        .t-list { width: 100%; border-collapse: collapse; font-size: var(--fs-md); }
        .t-list th { font-weight: 500; color: var(--t-3); text-align: left; padding: 8px 16px; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.04em; background: var(--bg-1); border-bottom: 1px solid var(--bd-1);}
        .t-list th.r, .t-list td.r { text-align: right; }
        .t-list td { padding: 10px 16px; border-bottom: 1px solid var(--bd-1); color: var(--t-1); }
        .t-list tr:last-child td { border-bottom: 0;}
        .hook-row { cursor: pointer; transition: background .12s; }
        .hook-row:hover td { background: var(--bg-1); }
        .hook-row.open td { background: var(--acc-soft); }
        .pill { padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; display: inline-flex; }
        .pill.ok   { background: var(--ok-soft); color: var(--ok); }
        .pill.bad  { background: var(--bad-soft); color: var(--bad); }
        .pill.warn { background: var(--warn-soft); color: var(--warn); }
      `}</style>
    </div>
  );
}

function DetailDrawer({
  lang,
  loading,
  detail,
  onClose,
}: {
  lang: import("@/lib/i18n").Lang;
  loading: boolean;
  detail: WebhookLogDetail | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [replayPending, startReplay] = useTransition();
  const [replayResult, setReplayResult] = useState<{ ok: boolean; httpStatus?: number; body?: string | null; error?: string } | null>(null);

  const onReplay = () => {
    if (!detail) return;
    if (!confirm(lang === "ko" ? "이 webhook을 재처리합니다. 계속할까요?" : "Replay this webhook. Continue?")) return;
    setReplayResult(null);
    startReplay(async () => {
      const r = await replayWebhook(detail.id);
      if (r.ok) {
        setReplayResult({ ok: true, httpStatus: r.httpStatus, body: r.responseBody });
        router.refresh();
      } else {
        setReplayResult({ ok: false, error: r.error });
      }
    });
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="d-head">
          <div>
            <div className="title">{lang === "ko" ? "Webhook 상세" : "Webhook detail"}</div>
            {detail && <div className="sub text-muted" style={{ fontSize: 11 }}>{detail.provider} · {detail.eventType ?? "—"}</div>}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {detail && (
              <button className="btn sm" onClick={onReplay} disabled={replayPending}>
                <I.refresh size={11} /> {replayPending ? (lang === "ko" ? "재처리 중…" : "Replaying…") : (lang === "ko" ? "재처리" : "Replay")}
              </button>
            )}
            <button className="btn icon ghost" onClick={onClose} aria-label="Close">
              <I.close size={14} />
            </button>
          </div>
        </div>
        <div className="d-body">
          {loading && <div className="empty">{lang === "ko" ? "불러오는 중…" : "Loading…"}</div>}
          {!loading && !detail && <div className="empty">{lang === "ko" ? "데이터를 찾을 수 없습니다." : "No detail found."}</div>}
          {detail && (
            <>
              {replayResult && (
                <div className={`alert ${replayResult.ok ? "ok" : "bad"}`}>
                  {replayResult.ok
                    ? `${lang === "ko" ? "재처리 완료" : "Replay sent"} — HTTP ${replayResult.httpStatus}`
                    : `${lang === "ko" ? "재처리 실패" : "Replay failed"}: ${replayResult.error}`}
                </div>
              )}
              <div className="kv">
                <span className="k">{lang === "ko" ? "시각" : "Received"}</span>
                <span className="v mono">{fmtClock(detail.receivedAt)}</span>
              </div>
              <div className="kv">
                <span className="k">HTTP</span>
                <span className="v">{detail.httpStatus}</span>
              </div>
              <div className="kv">
                <span className="k">{lang === "ko" ? "소요" : "Duration"}</span>
                <span className="v">{detail.durationMs}ms</span>
              </div>
              {detail.responseBody && (
                <div className="kv block">
                  <span className="k">{lang === "ko" ? "응답" : "Response"}</span>
                  <pre>{detail.responseBody}</pre>
                </div>
              )}
              <div className="kv block">
                <span className="k">{lang === "ko" ? "헤더" : "Headers"}</span>
                <pre>{JSON.stringify(detail.headers, null, 2)}</pre>
              </div>
              <div className="kv block">
                <span className="k">{lang === "ko" ? "본문" : "Body"}</span>
                <pre>{detail.body}</pre>
              </div>
            </>
          )}
        </div>
        <style>{`
          .drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.32); z-index: 60; display: flex; justify-content: flex-end; }
          .drawer { width: min(560px, 100vw); height: 100%; background: var(--bg); border-left: 1px solid var(--bd-1); display: flex; flex-direction: column; }
          .d-head { display: flex; justify-content: space-between; align-items: flex-start; padding: 14px 16px; border-bottom: 1px solid var(--bd-1); }
          .d-head .title { font-weight: 600; color: var(--t-1); font-size: 14px; }
          .d-body { flex: 1; overflow-y: auto; padding: 12px 16px 24px; display: flex; flex-direction: column; gap: 10px; }
          .empty { padding: 24px; text-align: center; color: var(--t-3); font-size: 12px; }
          .kv { display: flex; gap: 12px; align-items: baseline; font-size: 12px; }
          .kv.block { flex-direction: column; gap: 4px; align-items: stretch; }
          .kv .k { color: var(--t-3); font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; min-width: 72px; }
          .kv .v { color: var(--t-1); font-weight: 500; }
          .kv .v.mono { font-family: monospace; }
          .kv pre { margin: 0; background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: 6px; padding: 8px 10px; font-size: 11px; line-height: 1.5; max-height: 260px; overflow: auto; white-space: pre-wrap; word-break: break-all; }
          .alert { padding: 8px 12px; border-radius: 6px; font-size: 12px; }
          .alert.ok  { background: var(--ok-soft); color: var(--ok); }
          .alert.bad { background: var(--bad-soft); color: var(--bad); }
        `}</style>
      </aside>
    </div>
  );
}
