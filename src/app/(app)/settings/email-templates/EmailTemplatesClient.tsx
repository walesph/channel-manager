"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useApp } from "@/lib/app-context";
import { I } from "@/components/icons";
import type { EmailTemplateRow } from "@/lib/queries";
import { resetEmailTemplate, upsertEmailTemplate } from "@/lib/actions";
import type { EmailTemplateKind } from "@prisma/client";
import type { Lang } from "@/lib/i18n";

const KIND_LABEL: Record<string, { ko: string; en: string; vars: string[] }> = {
  checkin_reminder: {
    ko: "체크인 리마인더 (24시간 전)",
    en: "Check-in reminder (24h before)",
    vars: ["{{guestName}}", "{{hotelName}}", "{{checkIn}}"],
  },
  review_request: {
    ko: "리뷰 요청 (체크아웃 다음날)",
    en: "Review request (day after checkout)",
    vars: ["{{guestName}}", "{{hotelName}}"],
  },
  payment_failed: {
    ko: "결제 실패 알림",
    en: "Payment failed notification",
    vars: ["{{guestName}}", "{{hotelName}}", "{{bookingRef}}"],
  },
};

export function EmailTemplatesClient({ templates }: { templates: EmailTemplateRow[] }) {
  const { lang } = useApp();
  return (
    <div className="page">
      <div className="header">
        <Link href="/settings" className="back-link text-muted">
          <I.arrowL size={11} /> {lang === "ko" ? "설정" : "Settings"}
        </Link>
        <h1>{lang === "ko" ? "이메일 템플릿" : "Email templates"}</h1>
        <div className="sub text-muted">
          {lang === "ko"
            ? "cron이 게스트에게 발송하는 이메일을 호텔별로 커스터마이징"
            : "Customize the emails the cron sends to guests, per hotel"}
        </div>
      </div>

      {templates.map((t) => (
        <TemplateCard key={t.kind} lang={lang} template={t} />
      ))}

      <style>{`
        .page { padding: 20px 24px 32px; display: flex; flex-direction: column; gap: 16px; }
        .header h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin: 6px 0 2px; color: var(--t-1); }
        .header .sub { font-size: 12px; }
        .back-link { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; text-decoration: none; }
      `}</style>
    </div>
  );
}

function TemplateCard({ lang, template }: { lang: Lang; template: EmailTemplateRow }) {
  const router = useRouter();
  const meta = KIND_LABEL[template.kind] ?? { ko: template.kind, en: template.kind, vars: [] };
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [enabled, setEnabled] = useState(template.enabled);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    subject !== template.subject ||
    body !== template.body ||
    enabled !== template.enabled;
  const isDefault = template.id === null;

  const onSave = () => {
    if (!dirty) return;
    setError(null);
    startTransition(async () => {
      const r = await upsertEmailTemplate({
        kind: template.kind as EmailTemplateKind,
        subject,
        body,
        enabled,
      });
      if (r.ok) {
        setSavedAt(new Date());
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  };

  const onReset = () => {
    if (!confirm(lang === "ko" ? "기본 템플릿으로 되돌릴까요?" : "Reset to built-in default?")) return;
    setError(null);
    startTransition(async () => {
      const r = await resetEmailTemplate(template.kind as EmailTemplateKind);
      if (r.ok) {
        setSubject(template.defaultSubject);
        setBody(template.defaultBody);
        setEnabled(true);
        setSavedAt(null);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  };

  return (
    <section className="card">
      <div className="sec-h">
        <div>
          <div className="title">
            {lang === "ko" ? meta.ko : meta.en}
            {isDefault && <span className="badge">{lang === "ko" ? "기본값" : "Default"}</span>}
          </div>
          <div className="sub">
            {lang === "ko" ? "사용 가능한 변수: " : "Variables: "}
            {meta.vars.map((v) => <code key={v}>{v} </code>)}
          </div>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={pending}
          />
          <span>{enabled ? (lang === "ko" ? "활성" : "Enabled") : (lang === "ko" ? "비활성" : "Disabled")}</span>
        </label>
      </div>
      <div className="form">
        <div className="row">
          <label>{lang === "ko" ? "제목" : "Subject"}</label>
          <input
            type="text"
            value={subject}
            maxLength={200}
            onChange={(e) => setSubject(e.target.value)}
            disabled={pending}
          />
        </div>
        <div className="row">
          <label>{lang === "ko" ? "본문" : "Body"}</label>
          <textarea
            value={body}
            maxLength={4000}
            rows={6}
            onChange={(e) => setBody(e.target.value)}
            disabled={pending}
          />
        </div>
        {error && <div className="alert bad"><I.warn size={12} /> {error}</div>}
        <div className="actions">
          {savedAt && !dirty && (
            <span className="text-muted" style={{ fontSize: 11 }}>
              <I.check size={11} /> {lang === "ko" ? "저장됨" : "Saved"}
            </span>
          )}
          {!isDefault && (
            <button className="btn ghost sm" onClick={onReset} disabled={pending}>
              {lang === "ko" ? "기본값으로 되돌리기" : "Reset to default"}
            </button>
          )}
          <button className="btn sm" onClick={onSave} disabled={!dirty || pending}>
            {pending ? (lang === "ko" ? "저장 중…" : "Saving…") : (lang === "ko" ? "저장" : "Save")}
          </button>
        </div>
      </div>
      <style>{`
        .badge { background: var(--bg-mute); color: var(--t-3); font-size: 10px; padding: 1px 6px; border-radius: 999px; margin-left: 8px; font-weight: 500; vertical-align: middle; }
        .toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; user-select: none; }
        .toggle input { margin: 0; }
        .form { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 10px; }
        .row { display: grid; grid-template-columns: 80px 1fr; align-items: start; gap: 12px; }
        .row label { color: var(--t-3); font-size: 12px; font-weight: 500; padding-top: 8px; }
        .row input, .row textarea {
          padding: 8px 10px; border: 1px solid var(--bd-1); border-radius: 6px;
          background: var(--bg-elev); color: var(--t-1); font: inherit; font-size: 12px;
          line-height: 1.5; resize: vertical;
        }
        .row input { height: 32px; padding: 0 10px; }
        .row input:focus, .row textarea:focus { outline: 2px solid var(--acc-soft); outline-offset: -1px; border-color: var(--acc); }
        .actions { display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding-top: 4px; }
        .alert { padding: 8px 12px; border-radius: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px; background: var(--bad-soft); color: var(--bad); }
        code { background: var(--bg-mute); padding: 1px 4px; border-radius: 3px; font-size: 11px; }
      `}</style>
    </section>
  );
}
