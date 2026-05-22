"use client";

import { useEffect, useState, useTransition } from "react";
import { I } from "../icons";
import { getOrCreateOwnerICalToken, revokeOwnerICalToken, rotateOwnerICalToken } from "@/lib/actions";
import type { Lang } from "@/lib/i18n";

/**
 * Owner-facing read-only iCal feed control. Lazy: we don't auto-mint a token
 * on first render (avoids creating tokens for users who never look at this
 * card). Click "활성화" to mint, then copy the URL into Google Cal etc.
 */
export function OwnerICalPanel({ lang, hotelName }: { lang: Lang; hotelName: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const url = token ? `${origin}/api/ical/hotel/${token}.ics?lang=${lang}` : "";

  const enable = () => {
    setError(null);
    startTransition(async () => {
      const r = await getOrCreateOwnerICalToken();
      if ("ok" in r && r.ok) setToken(r.token);
      else if ("error" in r) setError(r.error);
    });
  };
  const rotate = () => {
    if (!confirm(lang === "ko" ? "토큰을 새로 발급하면 기존 구독자는 끊어집니다. 계속할까요?" : "Rotating revokes the old token. Continue?")) return;
    setError(null);
    startTransition(async () => {
      const r = await rotateOwnerICalToken();
      if ("ok" in r && r.ok) setToken(r.token);
      else if ("error" in r) setError(r.error);
    });
  };
  const revoke = () => {
    if (!confirm(lang === "ko" ? "피드를 비활성화하시겠습니까?" : "Disable the feed?")) return;
    setError(null);
    startTransition(async () => {
      const r = await revokeOwnerICalToken();
      if ("ok" in r && r.ok) setToken(null);
      else if ("error" in r) setError(r.error);
    });
  };
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(lang === "ko" ? "복사에 실패했습니다. URL을 직접 선택해 복사하세요." : "Copy failed. Select the URL manually.");
    }
  };

  return (
    <section className="card">
      <div className="sec-h">
        <div>
          <div className="title">
            {lang === "ko" ? "달력 피드" : "Calendar feed"}
            {token && <span className="pill ok" style={{ marginLeft: 8, fontSize: 10 }}>ON</span>}
          </div>
          <div className="sub" style={{ fontSize: 12, color: "var(--t-3)" }}>
            {lang === "ko"
              ? "Google Cal / Apple Cal에 구독해서 모든 채널 예약을 한 곳에서 보세요. 읽기 전용입니다."
              : "Subscribe in Google / Apple Calendar to see all channels' bookings in one view. Read-only."}
          </div>
        </div>
        {!token && (
          <button className="btn sm" onClick={enable} disabled={pending}>
            <I.cal size={11} /> {pending ? "…" : (lang === "ko" ? "활성화" : "Enable")}
          </button>
        )}
      </div>
      {token && (
        <div className="ical-body">
          <div className="ical-row">
            <input type="text" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <button className="btn sm" onClick={copy} title={lang === "ko" ? "복사" : "Copy"}>
              <I.link size={11} /> {copied ? (lang === "ko" ? "복사됨" : "Copied") : (lang === "ko" ? "복사" : "Copy")}
            </button>
          </div>
          <div className="ical-actions">
            <span className="text-muted" style={{ fontSize: 11 }}>
              {lang === "ko"
                ? `호텔: ${hotelName} · 언어: ${lang.toUpperCase()}`
                : `Hotel: ${hotelName} · Language: ${lang.toUpperCase()}`}
            </span>
            <div style={{ flex: 1 }} />
            <button className="btn sm ghost" onClick={rotate} disabled={pending}>
              <I.refresh size={11} /> {lang === "ko" ? "토큰 재발급" : "Rotate token"}
            </button>
            <button className="btn sm ghost danger" onClick={revoke} disabled={pending}>
              {lang === "ko" ? "비활성화" : "Disable"}
            </button>
          </div>
        </div>
      )}
      {error && <div className="alert bad" style={{ margin: "0 16px 12px" }}><I.warn size={11} /> {error}</div>}
      <style>{`
        .ical-body { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 10px; }
        .ical-row { display: flex; gap: 8px; align-items: center; }
        .ical-row input {
          flex: 1; height: 32px; padding: 0 10px;
          border: 1px solid var(--bd-1); border-radius: 6px;
          background: var(--bg-mute); color: var(--t-2);
          font: inherit; font-size: 11px; font-family: monospace;
        }
        .ical-actions { display: flex; gap: 8px; align-items: center; }
        .ical-actions .btn.danger { color: var(--bad); }
        .alert { padding: 8px 12px; border-radius: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px; background: var(--bad-soft); color: var(--bad); }
        .pill.ok { background: var(--ok-soft); color: var(--ok); padding: 2px 6px; border-radius: 999px; font-weight: 600; letter-spacing: 0.04em; }
      `}</style>
    </section>
  );
}
