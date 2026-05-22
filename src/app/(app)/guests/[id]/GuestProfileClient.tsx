"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useApp } from "@/lib/app-context";
import { I } from "@/components/icons";
import { channelById } from "@/lib/i18n";
import type { GuestProfile } from "@/lib/queries";
import { cancelGuestDeletion, fetchGuestDataExport, requestGuestDeletion, setGuestNotes } from "@/lib/actions";

function fmtDate(iso: string, lang: "ko" | "en" | "ja" | "zh"): string {
  const d = new Date(iso);
  return d.toLocaleDateString(lang === "ko" ? "ko-KR" : lang === "ja" ? "ja-JP" : lang === "zh" ? "zh-CN" : "en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function fmtClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function GuestProfileClient({ profile }: { profile: GuestProfile }) {
  const { lang } = useApp();
  const router = useRouter();
  const [notes, setNotes] = useState(profile.notes ?? "");
  const [tags, setTags] = useState<string[]>(profile.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    (notes ?? "") !== (profile.notes ?? "") ||
    JSON.stringify(tags) !== JSON.stringify(profile.tags);

  const onAddTag = () => {
    const t = tagDraft.trim();
    if (!t) return;
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setTagDraft("");
      return;
    }
    setTags((prev) => [...prev, t]);
    setTagDraft("");
  };
  const onRemoveTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t));

  const onSave = () => {
    setError(null);
    startTransition(async () => {
      const r = await setGuestNotes({ guestId: profile.id, notes, tags });
      if (r.ok) {
        setSavedAt(new Date());
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  };

  const onExport = async () => {
    setError(null);
    try {
      const data = await fetchGuestDataExport(profile.id);
      if (!data) throw new Error("not found");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `guest-export-${profile.name.replace(/[^a-zA-Z0-9-]/g, "_")}-${profile.id.slice(-6)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onRequestDeletion = () => {
    if (!confirm(lang === "ko"
      ? "이 게스트의 모든 데이터 삭제를 요청합니다. 30일 후 자동 처리됩니다."
      : "Request deletion of all this guest's data. Auto-processed after 30 days.")) return;
    setError(null);
    startTransition(async () => {
      const r = await requestGuestDeletion(profile.id);
      if ("ok" in r && r.ok) router.refresh();
      else if ("error" in r) setError(r.error);
    });
  };

  const onCancelDeletion = () => {
    setError(null);
    startTransition(async () => {
      const r = await cancelGuestDeletion(profile.id);
      if ("ok" in r && r.ok) router.refresh();
      else if ("error" in r) setError(r.error);
    });
  };

  return (
    <div className="page">
      <div className="header">
        <Link href="/bookings" className="back-link text-muted">
          <I.arrowL size={11} /> {lang === "ko" ? "예약" : "Bookings"}
        </Link>
        <div className="hero">
          <div className="avatar">
            <span className="flag">{profile.countryFlag}</span>
            <span className="initial">{profile.name.slice(0, 1).toUpperCase()}</span>
          </div>
          <div style={{ flex: 1 }}>
            <h1>{profile.name}</h1>
            <div className="sub text-muted">
              {profile.country ?? "—"}
              {profile.email && <> · <a href={`mailto:${profile.email}`}>{profile.email}</a></>}
              {profile.phone && <> · {profile.phone}</>}
            </div>
            {profile.tags.length > 0 && (
              <div className="tag-row" style={{ marginTop: 6 }}>
                {profile.tags.map((t) => <span key={t} className="tag">{t}</span>)}
              </div>
            )}
            {profile.deletionRequestedAt && (
              <div className="del-banner">
                <I.warn size={11} />
                {lang === "ko"
                  ? `삭제 요청됨 — ${fmtDate(profile.deletionRequestedAt, lang)} (30일 후 자동 삭제)`
                  : `Deletion requested ${fmtDate(profile.deletionRequestedAt, lang)} (auto-delete in 30 days)`}
              </div>
            )}
          </div>
          <div className="hero-actions">
            <button className="btn sm ghost" onClick={onExport} disabled={pending} title={lang === "ko" ? "전체 데이터를 JSON으로" : "Export all data as JSON"}>
              <I.download size={11} /> {lang === "ko" ? "데이터 내보내기" : "Export data"}
            </button>
            {profile.deletionRequestedAt ? (
              <button className="btn sm ghost" onClick={onCancelDeletion} disabled={pending}>
                {lang === "ko" ? "삭제 요청 취소" : "Cancel deletion"}
              </button>
            ) : (
              <button className="btn sm ghost danger-btn" onClick={onRequestDeletion} disabled={pending}>
                {lang === "ko" ? "삭제 요청" : "Request deletion"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="ltv-row">
        <Stat label={lang === "ko" ? "총 예약" : "Bookings"} value={`${profile.ltv.bookingsCount}`} sub={profile.cancelledCount > 0 ? `+${profile.cancelledCount} ${lang === "ko" ? "취소" : "cancelled"}` : undefined} />
        <Stat label={lang === "ko" ? "LTV" : "Lifetime spend"} value={`₩${profile.ltv.revenue.toLocaleString()}`} />
        <Stat label={lang === "ko" ? "총 박수" : "Total nights"} value={`${profile.ltv.nights}`} />
        <Stat label={lang === "ko" ? "박당 평균" : "Avg/night"} value={`₩${profile.ltv.avgPerNight.toLocaleString()}`} />
        <Stat
          label={lang === "ko" ? "첫/마지막 투숙" : "First / last"}
          value={
            profile.ltv.firstStayIso
              ? `${fmtDate(profile.ltv.firstStayIso, lang)} → ${fmtDate(profile.ltv.lastStayIso ?? profile.ltv.firstStayIso, lang)}`
              : "—"
          }
        />
      </div>

      {profile.upcoming.length > 0 && (
        <section className="card">
          <div className="sec-h">
            <div className="title">{lang === "ko" ? "예정된 투숙" : "Upcoming stays"}</div>
            <div className="sub">{profile.upcoming.length} {lang === "ko" ? "건" : "items"}</div>
          </div>
          <table className="t-list">
            <thead>
              <tr>
                <th>{lang === "ko" ? "체크인" : "Check-in"}</th>
                <th>{lang === "ko" ? "체크아웃" : "Check-out"}</th>
                <th>{lang === "ko" ? "객실" : "Room"}</th>
                <th>{lang === "ko" ? "채널" : "Channel"}</th>
                <th>{lang === "ko" ? "예약번호" : "Ref"}</th>
              </tr>
            </thead>
            <tbody>
              {profile.upcoming.map((b) => {
                const ch = channelById(b.channel);
                return (
                  <tr key={b.id}>
                    <td>{fmtDate(b.checkIn, lang)}</td>
                    <td>{fmtDate(b.checkOut, lang)}</td>
                    <td>{b.roomType}</td>
                    <td><span className="mini-ch"><span className={`dot ${ch?.cls ?? ""}`} />{ch?.name ?? b.channel}</span></td>
                    <td className="mono text-muted">{b.bookingRef ?? b.id.slice(-6)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <div className="sec-h">
          <div className="title">{lang === "ko" ? "메모 + 태그" : "Notes + tags"}</div>
          <div className="sub">{lang === "ko" ? "운영 내부 전용" : "Internal — never shown to the guest"}</div>
        </div>
        <div className="notes-body">
          <div className="tag-input">
            {tags.map((t) => (
              <span key={t} className="tag editable">
                {t}
                <button type="button" onClick={() => onRemoveTag(t)} aria-label="remove">
                  <I.close size={9} />
                </button>
              </span>
            ))}
            <input
              type="text"
              placeholder={lang === "ko" ? "+ 태그 추가 (Enter)" : "+ Add tag (Enter)"}
              value={tagDraft}
              maxLength={40}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); onAddTag(); }
                if (e.key === "Backspace" && !tagDraft && tags.length > 0) {
                  // Quick-remove last tag
                  setTags((prev) => prev.slice(0, -1));
                }
              }}
              disabled={pending}
            />
          </div>
          <textarea
            value={notes}
            maxLength={4000}
            rows={5}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={lang === "ko" ? "메모 (예: 침구 알레르기, 늦은 체크인 가능)" : "Notes (e.g. bedding allergies, late check-in OK)"}
            disabled={pending}
          />
          {error && <div className="alert bad"><I.warn size={12} /> {error}</div>}
          <div className="actions">
            {savedAt && !dirty && (
              <span className="text-muted" style={{ fontSize: 11 }}>
                <I.check size={11} /> {lang === "ko" ? "저장됨" : "Saved"}
              </span>
            )}
            <button className="btn sm" onClick={onSave} disabled={!dirty || pending}>
              {pending ? (lang === "ko" ? "저장 중…" : "Saving…") : (lang === "ko" ? "저장" : "Save")}
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="sec-h">
          <div className="title">{lang === "ko" ? "타임라인" : "Timeline"}</div>
          <div className="sub">{profile.timeline.length} {lang === "ko" ? "항목 (최신 50)" : "items (newest 50)"}</div>
        </div>
        {profile.timeline.length === 0 ? (
          <div className="empty">{lang === "ko" ? "활동이 없습니다." : "No activity yet."}</div>
        ) : (
          <ul className="tl">
            {profile.timeline.map((entry) => {
              const ch = entry.channel ? channelById(entry.channel) : null;
              const Container = entry.href ? Link : "div";
              return (
                <li key={entry.id} className={`tl-row tl-${entry.kind}`}>
                  <Container
                    href={entry.href ?? "#"}
                    className="tl-inner"
                  >
                    <div className="tl-time text-muted mono">
                      {fmtDate(entry.occurredAt, lang)} {fmtClock(entry.occurredAt)}
                    </div>
                    <div className={`tl-dot tl-dot-${entry.kind}`} />
                    <div className="tl-body">
                      <div className="tl-title">{entry.title}</div>
                      <div className="tl-sub text-muted">
                        {ch && <span className="mini-ch"><span className={`dot ${ch.cls}`} />{ch.name}</span>}
                        {entry.sub && <> · <span>{entry.sub}</span></>}
                      </div>
                    </div>
                  </Container>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <style>{`
        .page { padding: 20px 24px 32px; display: flex; flex-direction: column; gap: 16px; }
        .header h1 { font-size: 24px; font-weight: 600; letter-spacing: -0.02em; margin: 4px 0 2px; color: var(--t-1); }
        .header .sub { font-size: 12px; }
        .header .sub a { color: var(--acc); text-decoration: none; }
        .back-link { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; text-decoration: none; }
        .hero { display: flex; gap: 14px; align-items: flex-start; margin-top: 8px; }
        .hero-actions { display: flex; gap: 6px; align-items: flex-start; padding-top: 4px; flex-wrap: wrap; }
        .hero-actions .btn.danger-btn { color: var(--bad); }
        .del-banner {
          margin-top: 8px; padding: 6px 10px;
          background: var(--bad-soft); color: var(--bad);
          border-radius: 6px; font-size: 11px; font-weight: 500;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .avatar {
          width: 64px; height: 64px; border-radius: 999px;
          background: var(--bg-mute); position: relative;
          display: inline-flex; align-items: center; justify-content: center;
          flex: 0 0 64px;
        }
        .avatar .flag { position: absolute; bottom: -2px; right: -2px; font-size: 18px; background: var(--bg); border-radius: 999px; padding: 1px 3px; }
        .avatar .initial { font-size: 28px; font-weight: 700; color: var(--t-2); letter-spacing: -0.02em; }
        .ltv-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
        .empty { padding: 32px; text-align: center; color: var(--t-3); font-size: 13px; }
        .t-list { width: 100%; border-collapse: collapse; font-size: var(--fs-md); }
        .t-list th { font-weight: 500; color: var(--t-3); text-align: left; padding: 8px 16px; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.04em; background: var(--bg-1); border-bottom: 1px solid var(--bd-1);}
        .t-list td { padding: 10px 16px; border-bottom: 1px solid var(--bd-1); color: var(--t-1); }
        .t-list tr:last-child td { border-bottom: 0;}
        .mini-ch { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--t-2); }
        .mini-ch .dot { width: 7px; height: 7px; border-radius: 2px; flex: 0 0 7px;}

        .tag-row { display: flex; gap: 4px; flex-wrap: wrap; }
        .tag {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 8px; border-radius: 999px;
          background: var(--acc-soft); color: var(--acc);
          font-size: 11px; font-weight: 500;
        }
        .tag.editable button {
          border: 0; background: transparent; padding: 0;
          color: inherit; cursor: pointer; opacity: 0.6;
          display: inline-flex; align-items: center;
        }
        .tag.editable button:hover { opacity: 1; }

        .notes-body { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 10px; }
        .tag-input {
          display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
          padding: 6px 8px; border: 1px solid var(--bd-1); border-radius: 6px;
          background: var(--bg-elev); min-height: 36px;
        }
        .tag-input input {
          border: 0; background: transparent; outline: none; flex: 1; min-width: 140px;
          font: inherit; font-size: 12px; color: var(--t-1);
        }
        .notes-body textarea {
          padding: 8px 10px; border: 1px solid var(--bd-1); border-radius: 6px;
          background: var(--bg-elev); color: var(--t-1); font: inherit; font-size: 12px;
          line-height: 1.5; resize: vertical;
        }
        .notes-body textarea:focus { outline: 2px solid var(--acc-soft); outline-offset: -1px; border-color: var(--acc); }
        .notes-body .actions { display: flex; justify-content: flex-end; align-items: center; gap: 8px; }
        .alert { padding: 8px 12px; border-radius: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px; background: var(--bad-soft); color: var(--bad); }

        .tl { list-style: none; padding: 0; margin: 0; }
        .tl-row { border-bottom: 1px solid var(--bd-1); }
        .tl-row:last-child { border-bottom: 0; }
        .tl-inner {
          display: grid; grid-template-columns: 140px 14px 1fr; gap: 10px;
          padding: 10px 16px; align-items: start;
          color: inherit; text-decoration: none;
        }
        .tl-inner:hover { background: var(--bg-1); }
        .tl-time { font-size: 11px; padding-top: 2px; }
        .tl-dot { width: 8px; height: 8px; border-radius: 999px; margin-top: 6px; }
        .tl-dot-booking { background: var(--acc); }
        .tl-dot-event   { background: var(--warn); }
        .tl-dot-message { background: var(--ok); }
        .tl-title { font-size: 13px; font-weight: 500; color: var(--t-1); text-transform: capitalize; }
        .tl-sub { font-size: 11px; margin-top: 2px; }
      `}</style>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      {sub && <div className="sub text-muted" style={{ fontSize: 10 }}>{sub}</div>}
      <style>{`
        .stat { background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: 6px; padding: 12px 14px; }
        .lbl { color: var(--t-3); font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500; }
        .val { font-size: 18px; font-weight: 600; color: var(--t-1); margin-top: 4px; font-variant-numeric: tabular-nums; }
      `}</style>
    </div>
  );
}
