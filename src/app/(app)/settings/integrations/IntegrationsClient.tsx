"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { I } from "@/components/icons";
import type { OutboundIntegrationRow, IntegrationEventStr, IntegrationProviderStr } from "@/lib/queries";
import { createOutboundIntegration, deleteOutboundIntegration, pingOutboundIntegration, toggleOutboundIntegration } from "@/lib/actions";
import { IntegrationEvent, IntegrationProvider } from "@prisma/client";

const EVENTS: { id: IntegrationEventStr; ko: string; en: string }[] = [
  { id: "booking_created",   ko: "신규 예약",       en: "New booking" },
  { id: "booking_cancelled", ko: "예약 취소",       en: "Booking cancelled" },
  { id: "payment_failed",    ko: "결제 실패",       en: "Payment failed" },
  { id: "warning_digest",    ko: "경고 다이제스트", en: "Warning digest" },
];

function fmtRel(iso: string | null, lang: "ko" | "en" | "ja" | "zh"): string {
  if (!iso) return lang === "ko" ? "발사 이력 없음" : "no fires yet";
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return lang === "ko" ? "방금" : "just now";
  if (m < 60) return lang === "ko" ? `${m}분 전` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return lang === "ko" ? `${h}시간 전` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return lang === "ko" ? `${d}일 전` : `${d}d ago`;
}

export function IntegrationsClient({ items }: { items: OutboundIntegrationRow[] }) {
  const { lang } = useApp();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{ provider: IntegrationProviderStr; label: string; url: string; events: IntegrationEventStr[] }>({
    provider: "slack",
    label: "",
    url: "",
    events: ["booking_created", "payment_failed"],
  });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const onToggleEvent = (e: IntegrationEventStr) => {
    setDraft((d) => ({
      ...d,
      events: d.events.includes(e) ? d.events.filter((x) => x !== e) : [...d.events, e],
    }));
  };

  const onCreate = () => {
    setError(null);
    setPendingId("__new__");
    startTransition(async () => {
      const r = await createOutboundIntegration({
        provider: draft.provider as IntegrationProvider,
        label: draft.label,
        webhookUrl: draft.url,
        events: draft.events as IntegrationEvent[],
      });
      setPendingId(null);
      if ("ok" in r && r.ok) {
        setCreating(false);
        setDraft({ provider: "slack", label: "", url: "", events: ["booking_created", "payment_failed"] });
        router.refresh();
      } else if ("error" in r) {
        setError(r.error);
      }
    });
  };

  const onPing = (id: string) => {
    setPingResult((p) => ({ ...p, [id]: "…" }));
    startTransition(async () => {
      const r = await pingOutboundIntegration(id);
      // BulkEditError has { ok: false, error }; success result has { ok, status, error? }.
      // Discriminate by presence of `status` (only on the ping success shape).
      if ("status" in r) {
        setPingResult((p) => ({ ...p, [id]: r.ok ? `✓ HTTP ${r.status}` : `✗ ${r.status}${r.error ? ` (${r.error})` : ""}` }));
      } else {
        setPingResult((p) => ({ ...p, [id]: `✗ ${r.error}` }));
      }
    });
  };

  const onToggle = (id: string, enabled: boolean) => {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const r = await toggleOutboundIntegration(id, enabled);
      setPendingId(null);
      if ("ok" in r && r.ok) router.refresh();
      else if ("error" in r) setError(r.error);
    });
  };

  const onDelete = (id: string, label: string) => {
    if (!confirm(lang === "ko" ? `"${label}"을(를) 삭제할까요?` : `Delete "${label}"?`)) return;
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const r = await deleteOutboundIntegration(id);
      setPendingId(null);
      if ("ok" in r && r.ok) router.refresh();
      else if ("error" in r) setError(r.error);
    });
  };

  return (
    <div className="page">
      <div className="header">
        <Link href="/settings" className="back-link text-muted">
          <I.arrowL size={11} /> {lang === "ko" ? "설정" : "Settings"}
        </Link>
        <h1>{lang === "ko" ? "외부 연동 (Slack / Discord)" : "Outbound integrations"}</h1>
        <div className="sub text-muted">
          {lang === "ko"
            ? "예약, 결제 실패 등 이벤트를 Slack 또는 Discord 채널에 자동으로 게시합니다."
            : "Auto-post bookings, payment failures, and warnings to Slack or Discord channels."}
        </div>
      </div>

      {error && <div className="alert bad"><I.warn size={12} /> {error}</div>}

      <section className="card">
        <div className="sec-h">
          <div>
            <div className="title">{lang === "ko" ? "활성 연동" : "Active integrations"}</div>
            <div className="sub">{items.length}{lang === "ko" ? "개" : ""}</div>
          </div>
          {!creating && (
            <button className="btn sm" onClick={() => { setCreating(true); setError(null); }}>
              <I.plus size={11} /> {lang === "ko" ? "신규" : "New"}
            </button>
          )}
        </div>

        {creating && (
          <div className="new-form">
            <div className="row">
              <label>{lang === "ko" ? "프로바이더" : "Provider"}</label>
              <select value={draft.provider} onChange={(e) => setDraft({ ...draft, provider: e.target.value as IntegrationProviderStr })}>
                <option value="slack">Slack</option>
                <option value="discord">Discord</option>
              </select>
            </div>
            <div className="row">
              <label>{lang === "ko" ? "라벨" : "Label"}</label>
              <input type="text" value={draft.label} maxLength={60} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder={draft.provider === "slack" ? "#bookings" : "#hotel-feed"} />
            </div>
            <div className="row">
              <label>Webhook URL</label>
              <input type="url" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder={draft.provider === "slack" ? "https://hooks.slack.com/services/T.../B.../..." : "https://discord.com/api/webhooks/..."} />
            </div>
            <div className="row">
              <label>{lang === "ko" ? "이벤트" : "Events"}</label>
              <div className="event-grid">
                {EVENTS.map((e) => (
                  <label key={e.id} className={`ev-chip ${draft.events.includes(e.id) ? "checked" : ""}`}>
                    <input type="checkbox" checked={draft.events.includes(e.id)} onChange={() => onToggleEvent(e.id)} />
                    <span>{lang === "ko" ? e.ko : e.en}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="actions">
              <button className="btn sm ghost" onClick={() => { setCreating(false); setError(null); }}>
                {lang === "ko" ? "취소" : "Cancel"}
              </button>
              <div style={{ flex: 1 }} />
              <button
                className="btn sm primary"
                onClick={onCreate}
                disabled={pendingId === "__new__" || !draft.url || !draft.label || draft.events.length === 0}
              >
                {pendingId === "__new__" ? "…" : (lang === "ko" ? "추가" : "Add")}
              </button>
            </div>
          </div>
        )}

        {items.length === 0 && !creating ? (
          <div className="empty">
            {lang === "ko"
              ? "아직 연동이 없습니다. Slack \"Incoming Webhooks\" 또는 Discord 채널의 \"통합 → Webhook\" 메뉴에서 URL을 받아 추가하세요."
              : "No integrations yet. Get a webhook URL from Slack 'Incoming Webhooks' or Discord channel Integrations → Webhooks."}
          </div>
        ) : (
          <table className="t-list">
            <thead>
              <tr>
                <th>{lang === "ko" ? "라벨" : "Label"}</th>
                <th>{lang === "ko" ? "프로바이더" : "Provider"}</th>
                <th>{lang === "ko" ? "이벤트" : "Events"}</th>
                <th className="r">{lang === "ko" ? "성공/실패" : "OK/Fail"}</th>
                <th className="r">{lang === "ko" ? "마지막 발사" : "Last fired"}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className={it.enabled ? "" : "disabled"}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{it.label}</div>
                    <div className="text-muted mono" style={{ fontSize: 10 }}>{it.webhookHostMasked}</div>
                  </td>
                  <td>
                    <span className={`pill ${it.provider}`}>{it.provider}</span>
                  </td>
                  <td>
                    <div className="ev-row">
                      {it.events.map((e) => {
                        const meta = EVENTS.find((x) => x.id === e);
                        return <span key={e} className="ev-tag">{lang === "ko" ? meta?.ko ?? e : meta?.en ?? e}</span>;
                      })}
                    </div>
                  </td>
                  <td className="r num">
                    <span style={{ color: "var(--ok)" }}>{it.successCount}</span>
                    <span className="text-muted"> / </span>
                    <span style={{ color: it.failureCount > 0 ? "var(--bad)" : "var(--t-3)" }}>{it.failureCount}</span>
                  </td>
                  <td className="r text-muted" style={{ fontSize: 11 }}>{fmtRel(it.lastFiredAt, lang)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", alignItems: "center" }}>
                      {pingResult[it.id] && (
                        <span className="text-muted mono" style={{ fontSize: 10, marginRight: 6 }}>{pingResult[it.id]}</span>
                      )}
                      <button className="btn xs ghost" onClick={() => onPing(it.id)} disabled={pendingId === it.id}>
                        {lang === "ko" ? "테스트" : "Ping"}
                      </button>
                      <button className="btn xs ghost" onClick={() => onToggle(it.id, !it.enabled)} disabled={pendingId === it.id}>
                        {it.enabled ? (lang === "ko" ? "비활성" : "Disable") : (lang === "ko" ? "활성" : "Enable")}
                      </button>
                      <button className="btn xs ghost danger" onClick={() => onDelete(it.id, it.label)} disabled={pendingId === it.id}>
                        {lang === "ko" ? "삭제" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <style>{`
        .page { padding: 20px 24px 32px; display: flex; flex-direction: column; gap: 16px; }
        .header h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin: 4px 0 2px; color: var(--t-1); }
        .back-link { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; text-decoration: none; }
        .header .sub { font-size: 12px; }
        .alert { padding: 8px 12px; border-radius: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px; background: var(--bad-soft); color: var(--bad); }
        .empty { padding: 32px; text-align: center; color: var(--t-3); font-size: 12px; }
        .new-form { padding: 12px 16px; border-bottom: 1px solid var(--bd-1); display: flex; flex-direction: column; gap: 8px; background: var(--bg-1); }
        .new-form .row { display: grid; grid-template-columns: 110px 1fr; gap: 10px; align-items: center; }
        .new-form label { color: var(--t-3); font-size: 12px; font-weight: 500; }
        .new-form input, .new-form select { height: 30px; padding: 0 8px; border: 1px solid var(--bd-1); border-radius: 6px; background: var(--bg-elev); color: var(--t-1); font: inherit; font-size: 12px; }
        .event-grid { display: flex; flex-wrap: wrap; gap: 4px; }
        .ev-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border: 1px solid var(--bd-1); border-radius: 999px; font-size: 11px; cursor: pointer; }
        .ev-chip.checked { background: var(--acc-soft); border-color: var(--acc); color: var(--acc); }
        .ev-chip input { display: none; }
        .actions { display: flex; align-items: center; padding-top: 4px; gap: 8px; }
        .t-list { width: 100%; border-collapse: collapse; font-size: var(--fs-md); }
        .t-list th { font-weight: 500; color: var(--t-3); text-align: left; padding: 8px 16px; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.04em; background: var(--bg-1); border-bottom: 1px solid var(--bd-1);}
        .t-list th.r, .t-list td.r { text-align: right; }
        .t-list td { padding: 12px 16px; border-bottom: 1px solid var(--bd-1); color: var(--t-1); }
        .t-list tr:last-child td { border-bottom: 0;}
        .t-list tr.disabled td { opacity: 0.55; }
        .ev-row { display: flex; flex-wrap: wrap; gap: 4px; }
        .ev-tag { font-size: 10px; padding: 1px 6px; background: var(--bg-mute); border-radius: 4px; color: var(--t-2); }
        .pill { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
        .pill.slack   { background: #4a154b; color: white; }
        .pill.discord { background: #5865f2; color: white; }
        .btn.xs { height: 22px; padding: 0 8px; font-size: 11px; }
        .btn.danger { color: var(--bad); }
      `}</style>
    </div>
  );
}
