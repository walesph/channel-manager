"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { I } from "@/components/icons";
import type { GuestDeletionQueueRow } from "@/lib/queries";
import { cancelGuestDeletion, fetchGuestDataExport, hardDeleteGuestNow } from "@/lib/actions";

function fmtDate(iso: string, lang: "ko" | "en" | "ja" | "zh"): string {
  const d = new Date(iso);
  return d.toLocaleDateString(
    lang === "ko" ? "ko-KR" : lang === "ja" ? "ja-JP" : lang === "zh" ? "zh-CN" : "en-US",
    { year: "numeric", month: "short", day: "numeric" },
  );
}

export function PrivacyClient({ queue }: { queue: GuestDeletionQueueRow[] }) {
  const { lang } = useApp();
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const onCancel = (id: string) => {
    if (!confirm(lang === "ko" ? "삭제 요청을 취소하시겠습니까?" : "Cancel the deletion request?")) return;
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const r = await cancelGuestDeletion(id);
      setPendingId(null);
      if ("ok" in r && r.ok) router.refresh();
      else if ("error" in r) setError(r.error);
    });
  };

  const onHardDelete = (id: string, name: string) => {
    const confirmText = lang === "ko"
      ? `정말로 "${name}"의 모든 데이터를 즉시 삭제하시겠습니까? 되돌릴 수 없습니다.`
      : `Really delete ALL data for "${name}" immediately? This is irreversible.`;
    if (!confirm(confirmText)) return;
    if (!confirm(lang === "ko" ? "한 번 더 확인합니다 — 정말 삭제할까요?" : "One more confirmation — really delete?")) return;
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const r = await hardDeleteGuestNow(id);
      setPendingId(null);
      if ("ok" in r && r.ok) router.refresh();
      else if ("error" in r) setError(r.error);
    });
  };

  const onExport = async (id: string, name: string) => {
    setError(null);
    setExportingId(id);
    try {
      const data = await fetchGuestDataExport(id);
      if (!data) throw new Error("not found");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `guest-export-${name.replace(/[^a-zA-Z0-9-]/g, "_")}-${id.slice(-6)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="page">
      <div className="header">
        <Link href="/settings" className="back-link text-muted">
          <I.arrowL size={11} /> {lang === "ko" ? "설정" : "Settings"}
        </Link>
        <h1>{lang === "ko" ? "개인정보 / GDPR" : "Privacy / GDPR"}</h1>
        <div className="sub text-muted">
          {lang === "ko"
            ? "게스트 데이터 내보내기 + 삭제 요청 처리. 삭제는 30일 grace period 후 cron이 자동 실행합니다."
            : "Export + delete guest data. Deletion completes after a 30-day grace period via cron."}
        </div>
      </div>

      {error && (
        <div className="alert bad"><I.warn size={12} /> {error}</div>
      )}

      <section className="card">
        <div className="sec-h">
          <div>
            <div className="title">{lang === "ko" ? "삭제 대기열" : "Deletion queue"}</div>
            <div className="sub">
              {lang === "ko"
                ? `${queue.length}명 — 30일 후 자동 삭제`
                : `${queue.length} guests — auto-delete after 30 days`}
            </div>
          </div>
        </div>
        {queue.length === 0 ? (
          <div className="empty">
            {lang === "ko"
              ? "현재 대기 중인 삭제 요청이 없습니다."
              : "No pending deletion requests."}
          </div>
        ) : (
          <table className="t-list">
            <thead>
              <tr>
                <th>{lang === "ko" ? "게스트" : "Guest"}</th>
                <th>{lang === "ko" ? "요청일" : "Requested"}</th>
                <th>{lang === "ko" ? "삭제 예정" : "Hard-delete on"}</th>
                <th className="r">{lang === "ko" ? "남은 일수" : "Days left"}</th>
                <th className="r">{lang === "ko" ? "동작" : "Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((g) => {
                const overdue = g.daysRemaining <= 0;
                return (
                  <tr key={g.id} className={overdue ? "overdue" : ""}>
                    <td>
                      <Link href={`/guests/${g.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                        <div style={{ fontWeight: 500 }}>{g.name}</div>
                        {g.email && <div className="text-muted" style={{ fontSize: 11 }}>{g.email}</div>}
                      </Link>
                    </td>
                    <td>{fmtDate(g.requestedAt, lang)}</td>
                    <td>{fmtDate(g.hardDeleteAt, lang)}</td>
                    <td className="r num">
                      <span className={`pill ${overdue ? "bad" : g.daysRemaining < 7 ? "warn" : "ok"}`}>
                        {overdue ? (lang === "ko" ? "기한 초과" : "overdue") : `${g.daysRemaining}d`}
                      </span>
                    </td>
                    <td className="r">
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn xs ghost" onClick={() => onExport(g.id, g.name)} disabled={exportingId === g.id}>
                          {exportingId === g.id ? "…" : (lang === "ko" ? "내보내기" : "Export")}
                        </button>
                        <button className="btn xs ghost" onClick={() => onCancel(g.id)} disabled={pendingId === g.id}>
                          {lang === "ko" ? "취소" : "Cancel"}
                        </button>
                        <button className="btn xs danger" onClick={() => onHardDelete(g.id, g.name)} disabled={pendingId === g.id}>
                          {pendingId === g.id ? "…" : (lang === "ko" ? "즉시 삭제" : "Delete now")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <div className="sec-h">
          <div>
            <div className="title">{lang === "ko" ? "게스트 별 데이터 내보내기" : "Export guest data"}</div>
            <div className="sub">
              {lang === "ko"
                ? "게스트 프로필 페이지의 \"내보내기\" 버튼으로 JSON 다운로드 — booking + thread + events + 모든 메타데이터 포함."
                : `Use the "Export" action on the guest profile to download a JSON dump — bookings + threads + events + all metadata.`}
            </div>
          </div>
          <Link className="btn sm" href="/bookings">
            {lang === "ko" ? "예약에서 게스트 찾기 →" : "Find guest via Bookings →"}
          </Link>
        </div>
      </section>

      <section className="card info">
        <div className="info-body">
          <h3>{lang === "ko" ? "30일 grace period" : "30-day grace period"}</h3>
          <p>
            {lang === "ko"
              ? "삭제 요청 후 30일 동안은 같은 페이지에서 \"취소\"로 되돌릴 수 있습니다. 30일 경과 시 자동으로 booking, thread, message가 모두 cascade 삭제됩니다. 즉시 삭제는 관리자만 사용해야 합니다 — 회계/세무 기록 보존 의무가 있는 경우 grace period를 활용하세요."
              : "Within 30 days of a request you can revert via Cancel. After 30 days, the cron cascade-deletes bookings, threads, and messages. Immediate delete is admin-only — prefer grace period when bookkeeping retention rules apply."}
          </p>
        </div>
      </section>

      <style>{`
        .page { padding: 20px 24px 32px; display: flex; flex-direction: column; gap: 16px; }
        .header h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin: 4px 0 2px; color: var(--t-1); }
        .back-link { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; text-decoration: none; }
        .header .sub { font-size: 12px; }
        .alert { padding: 8px 12px; border-radius: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px; background: var(--bad-soft); color: var(--bad); }
        .empty { padding: 32px; text-align: center; color: var(--t-3); font-size: 13px; }
        .t-list { width: 100%; border-collapse: collapse; font-size: var(--fs-md); }
        .t-list th { font-weight: 500; color: var(--t-3); text-align: left; padding: 8px 16px; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.04em; background: var(--bg-1); border-bottom: 1px solid var(--bd-1);}
        .t-list th.r, .t-list td.r { text-align: right; }
        .t-list td { padding: 12px 16px; border-bottom: 1px solid var(--bd-1); color: var(--t-1); }
        .t-list tr:last-child td { border-bottom: 0;}
        .t-list tr.overdue { background: var(--bad-soft); }
        .pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; }
        .pill.ok { background: var(--ok-soft); color: var(--ok); }
        .pill.warn { background: var(--warn-soft); color: var(--warn); }
        .pill.bad { background: var(--bad-soft); color: var(--bad); }
        .btn.xs { height: 24px; padding: 0 10px; font-size: 11px; }
        .btn.danger { color: var(--bad); border-color: var(--bad); }
        .info-body { padding: 16px; }
        .info-body h3 { margin: 0 0 6px; font-size: 13px; color: var(--t-1); }
        .info-body p { margin: 0; font-size: 12px; color: var(--t-2); line-height: 1.6; }
      `}</style>
    </div>
  );
}
