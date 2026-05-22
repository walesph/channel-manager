"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { I } from "../icons";
import type { Lang } from "@/lib/i18n";
import type { HotelInfo, SavedReplyRow } from "@/lib/queries";
import { clearHotelLogo, commitUpload, createSavedReply, deleteSavedReply, startUpload, updateHotelInfo, updateSavedReply } from "@/lib/actions";
import { UploadKind } from "@prisma/client";
import { PushPanel } from "./PushPanel";
import { OwnerICalPanel } from "./OwnerICalPanel";

const TZ_CHOICES = [
  "Asia/Seoul", "Asia/Tokyo", "Asia/Shanghai", "Asia/Singapore", "Asia/Bangkok",
  "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles", "UTC",
] as const;
const CURRENCY_CHOICES = ["KRW", "USD", "EUR", "JPY", "GBP", "CNY"] as const;

interface Props {
  lang: Lang;
  hotel: HotelInfo;
  savedReplies: SavedReplyRow[];
}

export function Settings({ lang, hotel, savedReplies }: Props) {
  const router = useRouter();
  const [name, setName] = useState(hotel.name);
  const [timezone, setTimezone] = useState(hotel.timezone);
  const [currency, setCurrency] = useState(hotel.currency);
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = name !== hotel.name || timezone !== hotel.timezone || currency !== hotel.currency;

  const onSave = () => {
    if (!dirty) return;
    setError(null);
    startTransition(async () => {
      const r = await updateHotelInfo({ name, timezone, currency });
      if (r.ok) {
        setSavedAt(new Date());
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  };

  const onReset = () => {
    setName(hotel.name);
    setTimezone(hotel.timezone);
    setCurrency(hotel.currency);
    setError(null);
  };

  return (
    <div className="page">
      <div className="header">
        <div>
          <h1>{lang === "ko" ? "설정" : "Settings"}</h1>
          <div className="sub text-muted">
            {lang === "ko" ? "호텔 정보, 자동 응답, 통합 설정" : "Hotel profile, saved replies, integrations"}
          </div>
        </div>
      </div>

      <section className="card">
        <div className="sec-h">
          <div>
            <div className="title">{lang === "ko" ? "호텔 정보" : "Hotel profile"}</div>
            <div className="sub">{lang === "ko" ? "이름, 시간대, 통화" : "Name, timezone, currency"}</div>
          </div>
        </div>
        <div className="form">
          <div className="row">
            <label>{lang === "ko" ? "이름" : "Name"}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              disabled={isPending}
            />
          </div>
          <div className="row">
            <label>{lang === "ko" ? "시간대" : "Timezone"}</label>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={isPending}>
              {TZ_CHOICES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <div className="row">
            <label>{lang === "ko" ? "통화" : "Currency"}</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={isPending}>
              {CURRENCY_CHOICES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {error && (
            <div className="alert bad">
              <I.warn size={12} /> {error}
            </div>
          )}
          <div className="actions">
            {savedAt && !dirty && (
              <span className="text-muted" style={{ fontSize: 11 }}>
                <I.check size={11} /> {lang === "ko" ? "저장됨" : "Saved"}
              </span>
            )}
            <button className="btn ghost sm" onClick={onReset} disabled={!dirty || isPending}>
              {lang === "ko" ? "되돌리기" : "Reset"}
            </button>
            <button className="btn sm" onClick={onSave} disabled={!dirty || isPending}>
              {isPending ? (lang === "ko" ? "저장 중…" : "Saving…") : (lang === "ko" ? "저장" : "Save")}
            </button>
          </div>
        </div>
      </section>

      <section className="card team-link-card">
        <div className="sec-h">
          <div>
            <div className="title">{lang === "ko" ? "구독 / 결제" : "Subscription / Billing"}</div>
            <div className="sub">
              {lang === "ko" ? "Stayboard 플랜 선택 + Stripe 결제 관리" : "Pick a Stayboard plan + manage Stripe billing"}
            </div>
          </div>
          <a className="btn sm primary" href="/settings/billing">
            {lang === "ko" ? "관리 →" : "Manage →"}
          </a>
        </div>
      </section>

      <PushPanel lang={lang} />

      <OwnerICalPanel lang={lang} hotelName={hotel.name} />

      <LogoCard lang={lang} initialLogoUrl={hotel.logoUrl} hotelName={hotel.name} />

      <section className="card">
        <div className="sec-h">
          <div>
            <div className="title">{lang === "ko" ? "통계" : "Stats"}</div>
            <div className="sub">{lang === "ko" ? "이 호텔의 데이터 요약" : "This hotel's data at a glance"}</div>
          </div>
        </div>
        <div className="stat-row">
          <Stat label={lang === "ko" ? "객실" : "Rooms"} value={hotel.stats.rooms} />
          <Stat label={lang === "ko" ? "채널" : "Channels"} value={hotel.stats.channels} />
          <Stat label={lang === "ko" ? "게스트" : "Guests"} value={hotel.stats.guests} />
          <Stat label={lang === "ko" ? "예약" : "Bookings"} value={hotel.stats.bookings} />
        </div>
      </section>

      <section className="card team-link-card">
        <div className="sec-h">
          <div>
            <div className="title">{lang === "ko" ? "팀 / 사용자" : "Team / Users"}</div>
            <div className="sub">
              {lang === "ko" ? "이 호텔에 접근 가능한 멤버 — Clerk Organization 단위" : "Members with access — managed via Clerk Organizations"}
            </div>
          </div>
          <a className="btn sm" href="/settings/team">
            {lang === "ko" ? "팀 관리 →" : "Manage team →"}
          </a>
        </div>
      </section>

      <section className="card team-link-card">
        <div className="sec-h">
          <div>
            <div className="title">{lang === "ko" ? "이메일 템플릿" : "Email templates"}</div>
            <div className="sub">
              {lang === "ko" ? "cron이 게스트에게 보내는 이메일 본문 — 호텔별 커스터마이징" : "Cron-sent guest emails — customize per hotel"}
            </div>
          </div>
          <a className="btn sm" href="/settings/email-templates">
            {lang === "ko" ? "템플릿 편집 →" : "Edit templates →"}
          </a>
        </div>
      </section>

      <section className="card team-link-card">
        <div className="sec-h">
          <div>
            <div className="title">{lang === "ko" ? "Webhook 로그" : "Webhook log"}</div>
            <div className="sub">
              {lang === "ko" ? "Clerk/Stripe/Booking.com 수신 이벤트 + 재처리" : "Inbound Clerk/Stripe/Booking.com events + replay"}
            </div>
          </div>
          <a className="btn sm" href="/settings/webhooks">
            {lang === "ko" ? "로그 보기 →" : "View log →"}
          </a>
        </div>
      </section>

      <section className="card team-link-card">
        <div className="sec-h">
          <div>
            <div className="title">{lang === "ko" ? "Slack / Discord 연동" : "Slack / Discord integrations"}</div>
            <div className="sub">
              {lang === "ko" ? "예약/결제 이벤트를 외부 채널에 자동 게시" : "Auto-post booking/payment events to external channels"}
            </div>
          </div>
          <a className="btn sm" href="/settings/integrations">
            {lang === "ko" ? "관리 →" : "Manage →"}
          </a>
        </div>
      </section>

      <section className="card team-link-card">
        <div className="sec-h">
          <div>
            <div className="title">{lang === "ko" ? "CSV 가져오기" : "CSV import"}</div>
            <div className="sub">
              {lang === "ko" ? "다른 PMS의 게스트 / 예약을 일괄 등록" : "Bulk-import guests / bookings from another PMS"}
            </div>
          </div>
          <a className="btn sm" href="/settings/import">
            {lang === "ko" ? "마법사 시작 →" : "Open wizard →"}
          </a>
        </div>
      </section>

      <section className="card team-link-card">
        <div className="sec-h">
          <div>
            <div className="title">{lang === "ko" ? "개인정보 / GDPR" : "Privacy / GDPR"}</div>
            <div className="sub">
              {lang === "ko" ? "게스트 데이터 내보내기 + 삭제 요청 처리" : "Export + delete guest data"}
            </div>
          </div>
          <a className="btn sm" href="/settings/privacy">
            {lang === "ko" ? "관리 →" : "Manage →"}
          </a>
        </div>
      </section>

      <SavedReplies lang={lang} initial={savedReplies} />

      <section className="card">
        <div className="sec-h">
          <div>
            <div className="title">{lang === "ko" ? "통합" : "Integrations"}</div>
            <div className="sub">{lang === "ko" ? "외부 서비스 연결 상태" : "External service connections"}</div>
          </div>
        </div>
        <div className="integration-list">
          <Integration
            name="Clerk"
            on={!!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
            note={lang === "ko" ? "사용자 인증 / 멀티테넌시" : "Auth / multi-tenancy"}
          />
          <Integration
            name="Stripe"
            on={false /* env-checked at action runtime */}
            note={lang === "ko" ? "결제 처리 (구독 / 게스트 카드)" : "Payments (subscription / guest cards)"}
          />
          <Integration
            name="Resend"
            on={!!process.env.NEXT_PUBLIC_RESEND_ENABLED}
            note={lang === "ko" ? "이메일 발송 (RESEND_API_KEY 미설정 시 mock 모드)" : "Email sender (mock mode when RESEND_API_KEY unset)"}
          />
          <Integration
            name="Hostaway"
            on={true}
            note={lang === "ko" ? "PMS 미들웨어 (모의 모드)" : "PMS middleware (mock mode)"}
          />
        </div>
      </section>

      <style>{`
        .page { padding: 20px 24px 32px; display: flex; flex-direction: column; gap: 16px; }
        .header h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin: 0; color: var(--t-1); }
        .header .sub { font-size: 12px; margin-top: 2px; }
        .form { padding: 16px; display: flex; flex-direction: column; gap: 12px; max-width: 520px; }
        .row { display: grid; grid-template-columns: 120px 1fr; align-items: center; gap: 12px; }
        .row label { color: var(--t-3); font-size: 12px; font-weight: 500; }
        .row input, .row select {
          height: 32px; padding: 0 10px; border: 1px solid var(--bd-1); border-radius: 6px;
          background: var(--bg-elev); color: var(--t-1); font: inherit; font-size: 13px;
        }
        .row input:focus, .row select:focus { outline: 2px solid var(--acc-soft); outline-offset: -1px; border-color: var(--acc); }
        .row input:disabled, .row select:disabled { opacity: 0.6; }
        .actions { display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding-top: 4px; }
        .alert { padding: 8px 12px; border-radius: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px; }
        .alert.bad { background: var(--bad-soft); color: var(--bad); }
        .empty { padding: 24px; text-align: center; color: var(--t-3); font-size: 13px; }
        .stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 12px 16px 16px; }
        .integration-list { padding: 8px 16px 16px; display: flex; flex-direction: column; }
        .t-list { width: 100%; border-collapse: collapse; font-size: var(--fs-md); }
        .t-list th { font-weight: 500; color: var(--t-3); text-align: left; padding: 8px 16px; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.04em; background: var(--bg-1); border-bottom: 1px solid var(--bd-1);}
        .t-list td { padding: 10px 16px; border-bottom: 1px solid var(--bd-1); color: var(--t-1); font-size: 12px; }
        .t-list tr:last-child td { border-bottom: 0;}
      `}</style>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <div className="lbl">{label}</div>
      <div className="val">{value.toLocaleString()}</div>
      <style>{`
        .stat { background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: 6px; padding: 12px 14px; }
        .lbl { color: var(--t-3); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500; }
        .val { font-size: 20px; font-weight: 600; color: var(--t-1); margin-top: 4px; font-variant-numeric: tabular-nums; }
      `}</style>
    </div>
  );
}

function Integration({ name, on, note }: { name: string; on: boolean; note: string }) {
  return (
    <div className="ig">
      <div className="ig-main">
        <span className={`dot ${on ? "ok" : "off"}`} />
        <span className="name">{name}</span>
        <span className="note text-muted">{note}</span>
      </div>
      <span className={`pill ${on ? "ok" : "muted"}`}>
        {on ? "Connected" : "Disabled"}
      </span>
      <style>{`
        .ig { display: flex; justify-content: space-between; align-items: center; padding: 10px 4px; border-bottom: 1px solid var(--bd-1); }
        .ig:last-child { border-bottom: 0; }
        .ig-main { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
        .ig-main .name { font-weight: 500; color: var(--t-1); font-size: 13px; }
        .ig-main .note { font-size: 11px; }
        .ig-main .dot { width: 8px; height: 8px; border-radius: 999px; flex: 0 0 8px; }
        .ig-main .dot.ok  { background: var(--ok); }
        .ig-main .dot.off { background: var(--bd-2); }
        .pill { padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; }
        .pill.ok    { background: var(--ok-soft); color: var(--ok); }
        .pill.muted { background: var(--bg-mute); color: var(--t-3); }
      `}</style>
    </div>
  );
}

interface DraftReply {
  /** Server-issued id, or null for an unsaved local draft. */
  id: string | null;
  label: string;
  body: string;
  /** Tracks dirty state vs. the last server-confirmed values. */
  baseLabel: string;
  baseBody: string;
}

function SavedReplies({ lang, initial }: { lang: Lang; initial: SavedReplyRow[] }) {
  const router = useRouter();
  const [items, setItems] = useState<DraftReply[]>(() =>
    initial.map((r) => ({ id: r.id, label: r.label, body: r.body, baseLabel: r.label, baseBody: r.body })),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{ label: string; body: string }>({ label: "", body: "" });
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const updateDraft = (idx: number, patch: Partial<DraftReply>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const isDirty = (it: DraftReply) =>
    it.id !== null && (it.label.trim() !== it.baseLabel || it.body.trim() !== it.baseBody);

  const onSave = (idx: number) => {
    const it = items[idx];
    if (!it.id) return;
    setError(null);
    setPendingId(it.id);
    startTransition(async () => {
      const r = await updateSavedReply(it.id!, it.label, it.body);
      setPendingId(null);
      if (r.ok) {
        updateDraft(idx, { label: r.label, body: r.body, baseLabel: r.label, baseBody: r.body });
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  };

  const onDelete = (idx: number) => {
    const it = items[idx];
    if (!it.id) return;
    if (!confirm(lang === "ko" ? `"${it.baseLabel}"을(를) 삭제할까요?` : `Delete "${it.baseLabel}"?`)) return;
    setError(null);
    setPendingId(it.id);
    startTransition(async () => {
      const r = await deleteSavedReply(it.id!);
      setPendingId(null);
      if (r.ok) {
        setItems((prev) => prev.filter((_, i) => i !== idx));
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  };

  const onCreate = () => {
    const label = draft.label.trim();
    const body = draft.body.trim();
    if (!label || !body) {
      setError(lang === "ko" ? "라벨과 본문을 모두 입력하세요" : "Both label and body are required");
      return;
    }
    setError(null);
    setPendingId("__new__");
    startTransition(async () => {
      const r = await createSavedReply(label, body);
      setPendingId(null);
      if (r.ok) {
        setItems((prev) => [...prev, { id: r.id, label: r.label, body: r.body, baseLabel: r.label, baseBody: r.body }]);
        setDraft({ label: "", body: "" });
        setCreating(false);
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
          <div className="title">{lang === "ko" ? "자동 응답" : "Saved replies"}</div>
          <div className="sub">
            {lang === "ko"
              ? `${items.length}개 — 메시지 화면에서 빠르게 삽입 가능`
              : `${items.length} entries — quick-insert from Messages`}
          </div>
        </div>
        {!creating && (
          <button className="btn sm" onClick={() => { setCreating(true); setError(null); }}>
            <I.plus size={12} /> {lang === "ko" ? "신규" : "New"}
          </button>
        )}
      </div>
      {error && (
        <div className="alert bad" style={{ margin: "0 16px 8px" }}>
          <I.warn size={12} /> {error}
        </div>
      )}
      <div className="reply-list">
        {creating && (
          <div className="reply-row new">
            <input
              type="text"
              className="lbl-in"
              placeholder={lang === "ko" ? "라벨 (예: 체크인 안내)" : "Label (e.g. Check-in info)"}
              value={draft.label}
              maxLength={60}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
              disabled={pendingId === "__new__"}
            />
            <textarea
              className="body-in"
              placeholder={lang === "ko" ? "본문" : "Body"}
              value={draft.body}
              maxLength={1200}
              rows={2}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              disabled={pendingId === "__new__"}
            />
            <div className="row-actions">
              <button className="btn sm ghost" onClick={() => { setCreating(false); setDraft({ label: "", body: "" }); setError(null); }}>
                {lang === "ko" ? "취소" : "Cancel"}
              </button>
              <button className="btn sm" onClick={onCreate} disabled={pendingId === "__new__"}>
                {pendingId === "__new__" ? (lang === "ko" ? "저장 중…" : "Saving…") : (lang === "ko" ? "추가" : "Add")}
              </button>
            </div>
          </div>
        )}
        {items.length === 0 && !creating && (
          <div className="empty">{lang === "ko" ? "등록된 자동 응답이 없습니다." : "No saved replies yet."}</div>
        )}
        {items.map((it, idx) => {
          const dirty = isDirty(it);
          const busy = pendingId === it.id;
          return (
            <div key={it.id ?? `local-${idx}`} className={`reply-row ${dirty ? "dirty" : ""}`}>
              <input
                type="text"
                className="lbl-in"
                value={it.label}
                maxLength={60}
                onChange={(e) => updateDraft(idx, { label: e.target.value })}
                disabled={busy}
              />
              <textarea
                className="body-in"
                value={it.body}
                maxLength={1200}
                rows={2}
                onChange={(e) => updateDraft(idx, { body: e.target.value })}
                disabled={busy}
              />
              <div className="row-actions">
                <button className="btn sm ghost danger" onClick={() => onDelete(idx)} disabled={busy}>
                  {lang === "ko" ? "삭제" : "Delete"}
                </button>
                <button className="btn sm" onClick={() => onSave(idx)} disabled={!dirty || busy}>
                  {busy ? (lang === "ko" ? "저장 중…" : "Saving…") : (lang === "ko" ? "저장" : "Save")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <style>{`
        .reply-list { padding: 8px 16px 16px; display: flex; flex-direction: column; gap: 10px; }
        .reply-row {
          border: 1px solid var(--bd-1); border-radius: 6px;
          padding: 10px 12px; background: var(--bg-elev);
          display: grid; grid-template-columns: 180px 1fr auto;
          gap: 8px; align-items: start;
          transition: border-color .12s;
        }
        .reply-row.new { border-color: var(--acc); background: var(--acc-soft); }
        .reply-row.dirty { border-color: var(--warn); }
        .reply-row .lbl-in {
          height: 30px; padding: 0 8px; font-size: 12px; font-weight: 500;
          border: 1px solid var(--bd-1); border-radius: 4px;
          background: var(--bg); color: var(--t-1);
        }
        .reply-row .body-in {
          font: inherit; font-size: 12px; line-height: 1.5;
          border: 1px solid var(--bd-1); border-radius: 4px;
          background: var(--bg); color: var(--t-1);
          padding: 6px 8px; resize: vertical; min-height: 30px;
        }
        .reply-row .lbl-in:focus, .reply-row .body-in:focus {
          outline: 2px solid var(--acc-soft); outline-offset: -1px; border-color: var(--acc);
        }
        .reply-row .row-actions { display: flex; flex-direction: column; gap: 4px; align-items: stretch; }
        .reply-row .row-actions .btn { white-space: nowrap; }
        .reply-row .row-actions .btn.danger { color: var(--bad); }
        .empty { padding: 24px; text-align: center; color: var(--t-3); font-size: 13px; }
        .alert { padding: 8px 12px; border-radius: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px; }
        .alert.bad { background: var(--bad-soft); color: var(--bad); }
      `}</style>
    </section>
  );
}

function LogoCard({ lang, initialLogoUrl, hotelName }: { lang: Lang; initialLogoUrl: string | null; hotelName: string }) {
  const router = useRouter();
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const onChoose = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      // 1. Ask the server for upload mode (presigned PUT or data-url fallback)
      const presigned = await startUpload({
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        kind: UploadKind.hotel_logo,
      });
      if (!presigned.ok) throw new Error(presigned.error);

      let publicUrl: string;
      if (presigned.mode === "s3" && presigned.putUrl) {
        // 2a. Upload bytes directly to object storage
        const putRes = await fetch(presigned.putUrl, {
          method: "PUT",
          headers: presigned.signedHeaders ?? {},
          body: file,
        });
        if (!putRes.ok) {
          throw new Error(`upload failed: ${putRes.status}`);
        }
        publicUrl = presigned.publicUrl!;
      } else {
        // 2b. Dev fallback — inline as a data: URL
        publicUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("read failed"));
          reader.readAsDataURL(file);
        });
      }

      // 3. Commit the upload to our DB so the URL is tracked + the hotel record gets logoUrl set
      const commit = await commitUpload({
        kind: UploadKind.hotel_logo,
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        url: publicUrl,
      });
      if (!commit.ok) throw new Error(commit.error);

      setLogoUrl(commit.url);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onClear = () => {
    if (!confirm(lang === "ko" ? "로고를 제거할까요?" : "Remove the logo?")) return;
    setError(null);
    setBusy(true);
    startTransition(async () => {
      const r = await clearHotelLogo();
      setBusy(false);
      if (r.ok) {
        setLogoUrl(null);
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
          <div className="title">{lang === "ko" ? "호텔 로고" : "Hotel logo"}</div>
          <div className="sub">
            {lang === "ko" ? "PNG / JPEG / WebP, 최대 5MB" : "PNG / JPEG / WebP, up to 5MB"}
          </div>
        </div>
      </div>
      <div className="logo-body">
        <div className="logo-preview" aria-label={lang === "ko" ? "현재 로고" : "Current logo"}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={`${hotelName} logo`} />
          ) : (
            <span className="placeholder">{hotelName.slice(0, 1)}</span>
          )}
        </div>
        <div className="logo-actions">
          <label className={`btn sm ${busy ? "disabled" : ""}`}>
            {busy ? (lang === "ko" ? "업로드 중…" : "Uploading…") : (lang === "ko" ? "이미지 선택" : "Choose image")}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onChoose(f);
                e.target.value = ""; // allow re-selecting same file
              }}
            />
          </label>
          {logoUrl && (
            <button className="btn sm ghost" onClick={onClear} disabled={busy}>
              {lang === "ko" ? "제거" : "Remove"}
            </button>
          )}
        </div>
        {error && <div className="alert bad" style={{ marginTop: 8 }}><I.warn size={12} /> {error}</div>}
      </div>
      <style>{`
        .logo-body { padding: 16px; display: flex; align-items: flex-start; gap: 16px; }
        .logo-preview {
          width: 80px; height: 80px; border-radius: 12px; overflow: hidden;
          background: var(--bg-mute); border: 1px solid var(--bd-1);
          display: flex; align-items: center; justify-content: center;
          flex: 0 0 80px;
        }
        .logo-preview img { width: 100%; height: 100%; object-fit: cover; }
        .logo-preview .placeholder {
          font-size: 36px; font-weight: 700; color: var(--t-3); letter-spacing: -0.02em;
        }
        .logo-actions { display: flex; gap: 8px; align-items: center; padding-top: 6px; }
        .logo-actions .btn input { display: none; }
        .logo-actions .btn.disabled { opacity: 0.6; pointer-events: none; }
        .alert { padding: 8px 12px; border-radius: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px; }
        .alert.bad { background: var(--bad-soft); color: var(--bad); }
      `}</style>
    </section>
  );
}
