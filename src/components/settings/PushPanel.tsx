"use client";

import { useEffect, useState, useTransition } from "react";
import { I } from "../icons";
import { getPushPublicKey, subscribePush, unsubscribePush } from "@/lib/actions";
import type { Lang } from "@/lib/i18n";

/**
 * Push-notification opt-in panel.
 *
 * State machine:
 *   - "checking"     reading current Notification.permission + SW registration
 *   - "blocked"      browser permission denied — user must change site settings
 *   - "unavailable"  no service worker support (e.g. iOS < 16.4 in non-PWA mode)
 *   - "off"          supported but not subscribed
 *   - "on"           subscribed; we have a row in PushSubscription
 */

type State = "checking" | "blocked" | "unavailable" | "off" | "on";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  // Standard helper from the Web Push spec — converts the base64url public
  // key into the byte array PushManager.subscribe expects.
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const b64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = typeof window !== "undefined" ? window.atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushPanel({ lang }: { lang: Lang }) {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);
  const [mockMode, setMockMode] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unavailable");
        return;
      }
      if (Notification.permission === "denied") {
        setState("blocked");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        setState(sub ? "on" : "off");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setState("unavailable");
      }
    })();
  }, []);

  const enable = async () => {
    setError(null);
    startTransition(async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const { publicKey, mock } = await getPushPublicKey();
        setMockMode(mock);
        if (mock || !publicKey) {
          // Without a real VAPID key we can't subscribe via PushManager —
          // fall back to recording a synthetic local subscription so the
          // dev preview can demonstrate the flow.
          const fakeEndpoint = `mock://local/${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          const r = await subscribePush({
            endpoint: fakeEndpoint,
            p256dh: "mock-p256dh",
            auth: "mock-auth",
            userAgent: navigator.userAgent,
          });
          if (!r.ok) throw new Error(r.error);
          setState("on");
          return;
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
          throw new Error("subscription missing endpoint or keys");
        }
        const r = await subscribePush({
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          userAgent: navigator.userAgent,
        });
        if (!r.ok) {
          await sub.unsubscribe().catch(() => undefined);
          throw new Error(r.error);
        }
        setState("on");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const disable = async () => {
    setError(null);
    startTransition(async () => {
      try {
        if (mockMode) {
          // Pull all anon subs for a clean slate (mock subs aren't reachable via PushManager).
          // Best-effort — no-op if endpoint is unknown.
          await unsubscribePush("mock://local/*").catch(() => undefined);
          setState("off");
          return;
        }
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (sub) {
          await unsubscribePush(sub.endpoint);
          await sub.unsubscribe();
        }
        setState("off");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const label = (() => {
    if (state === "checking") return lang === "ko" ? "확인 중…" : "Checking…";
    if (state === "unavailable")
      return lang === "ko"
        ? "이 브라우저는 푸시 알림을 지원하지 않습니다."
        : "Push notifications not supported in this browser.";
    if (state === "blocked")
      return lang === "ko"
        ? "브라우저 설정에서 알림을 차단했습니다. 사이트 설정에서 허용으로 변경하세요."
        : "Notifications blocked in your browser. Allow them in site settings.";
    if (state === "off")
      return lang === "ko"
        ? "활성화하면 새 예약, 메시지, 결제 실패 등이 핸드폰/데스크톱 알림으로 도착합니다."
        : "Enable to receive new bookings, messages, and payment failures as native notifications.";
    return lang === "ko" ? "푸시 알림이 활성화되어 있습니다." : "Push notifications are enabled.";
  })();

  return (
    <section className="card">
      <div className="sec-h">
        <div>
          <div className="title">
            {lang === "ko" ? "푸시 알림" : "Push notifications"}
            {state === "on" && (
              <span className="pill ok" style={{ marginLeft: 8, fontSize: 10 }}>
                {mockMode ? "MOCK" : "ON"}
              </span>
            )}
          </div>
          <div className="sub" style={{ fontSize: 12, color: "var(--t-3)" }}>
            {label}
          </div>
        </div>
        {state === "off" && (
          <button className="btn sm" onClick={enable} disabled={pending}>
            <I.bell size={11} /> {pending ? "…" : (lang === "ko" ? "활성화" : "Enable")}
          </button>
        )}
        {state === "on" && (
          <button className="btn sm ghost" onClick={disable} disabled={pending}>
            {pending ? "…" : (lang === "ko" ? "비활성화" : "Disable")}
          </button>
        )}
      </div>
      {error && (
        <div className="alert bad" style={{ margin: "0 16px 12px" }}>
          <I.warn size={11} /> {error}
        </div>
      )}
      <style>{`
        .alert { padding: 8px 12px; border-radius: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px; background: var(--bad-soft); color: var(--bad); }
        .pill.ok { background: var(--ok-soft); color: var(--ok); padding: 2px 6px; border-radius: 999px; font-weight: 600; letter-spacing: 0.04em; }
      `}</style>
    </section>
  );
}
