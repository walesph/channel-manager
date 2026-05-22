"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { I } from "@/components/icons";
import { openBillingPortal, startSubscriptionCheckout } from "@/lib/actions";
import type { SubscriptionPlan } from "@prisma/client";

interface State {
  plan: SubscriptionPlan | null;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  daysRemaining: number | null;
  isLocked: boolean;
}

interface PlanRow {
  id: SubscriptionPlan;
  name: string;
  priceKrw: number;
  features: { rooms: number | "unlimited"; channels: number | "unlimited"; emails: number | "unlimited" };
  stripePriceId: string;
}

export function BillingClient({ state, plans }: { state: State; plans: PlanRow[] }) {
  const { lang } = useApp();
  const router = useRouter();
  const [pendingPlan, setPendingPlan] = useState<SubscriptionPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const onSelect = (plan: SubscriptionPlan) => {
    setError(null);
    setPendingPlan(plan);
    startTransition(async () => {
      const r = await startSubscriptionCheckout(plan);
      setPendingPlan(null);
      if ("ok" in r && r.ok) {
        if (r.url.startsWith("/settings/billing?mock=")) {
          router.refresh();
        } else {
          window.location.href = r.url;
        }
      } else if ("error" in r) {
        setError(r.error);
      }
    });
  };

  const onPortal = () => {
    setError(null);
    startTransition(async () => {
      const r = await openBillingPortal();
      if ("ok" in r && r.ok) {
        if (r.url.startsWith("/settings/billing?mock=")) {
          alert(lang === "ko" ? "(Mock) Stripe 연결 후 사용 가능합니다." : "(Mock) Available once Stripe is wired.");
        } else {
          window.location.href = r.url;
        }
      } else if ("error" in r) {
        setError(r.error);
      }
    });
  };

  const statusLabel: Record<string, { ko: string; en: string; cls: string }> = {
    trial:     { ko: "트라이얼", en: "Trial",     cls: "info" },
    active:    { ko: "활성",     en: "Active",    cls: "ok" },
    past_due:  { ko: "기한 만료", en: "Past due",  cls: "bad" },
    cancelled: { ko: "취소됨",   en: "Cancelled", cls: "muted" },
  };
  const sl = statusLabel[state.status] ?? statusLabel.trial;

  return (
    <div className="page">
      <div className="header">
        <Link href="/settings" className="back-link text-muted">
          <I.arrowL size={11} /> {lang === "ko" ? "설정" : "Settings"}
        </Link>
        <h1>{lang === "ko" ? "구독 / 결제" : "Subscription / Billing"}</h1>
        <div className="sub text-muted">
          {lang === "ko" ? "Stayboard SaaS 플랜 — Stripe로 결제" : "Stayboard SaaS plans — billed via Stripe"}
        </div>
      </div>

      {error && <div className="alert bad"><I.warn size={12} /> {error}</div>}

      <section className="card">
        <div className="sec-h">
          <div>
            <div className="title">
              {lang === "ko" ? "현재 상태" : "Current status"}
              <span className={`pill ${sl.cls}`} style={{ marginLeft: 8, fontSize: 11 }}>
                {lang === "ko" ? sl.ko : sl.en}
              </span>
            </div>
            <div className="sub">
              {state.plan
                ? `${plans.find((p) => p.id === state.plan)?.name ?? state.plan}`
                : (lang === "ko" ? "플랜 미선택" : "No plan selected yet")}
              {state.daysRemaining !== null && (
                <> · {state.status === "trial"
                  ? state.daysRemaining > 0
                    ? lang === "ko" ? `트라이얼 ${state.daysRemaining}일 남음` : `${state.daysRemaining} trial days left`
                    : lang === "ko" ? "트라이얼 만료" : "trial expired"
                  : state.daysRemaining > 0
                    ? lang === "ko" ? `다음 결제일까지 ${state.daysRemaining}일` : `${state.daysRemaining}d to renewal`
                    : ""}
                </>
              )}
            </div>
          </div>
          {(state.status === "active" || state.status === "past_due") && (
            <button className="btn sm" onClick={onPortal}>
              <I.external size={11} /> {lang === "ko" ? "Stripe 포털" : "Stripe portal"}
            </button>
          )}
        </div>
        {state.isLocked && (
          <div className="lock-banner">
            <I.warn size={12} />
            {lang === "ko"
              ? "트라이얼이 만료되었거나 결제가 멈췄습니다. 플랜을 선택하면 모든 기능이 즉시 복구됩니다."
              : "Trial expired or billing paused. Pick a plan to unlock all features immediately."}
          </div>
        )}
      </section>

      <section className="card">
        <div className="sec-h">
          <div className="title">{lang === "ko" ? "플랜 선택" : "Choose a plan"}</div>
        </div>
        <div className="plan-grid">
          {plans.map((p) => {
            const isCurrent = state.plan === p.id && (state.status === "active" || state.status === "trial");
            return (
              <div key={p.id} className={`plan ${isCurrent ? "current" : ""}`}>
                <div className="plan-name">{p.name}</div>
                <div className="plan-price">
                  ₩{p.priceKrw.toLocaleString()}
                  <span className="per">/{lang === "ko" ? "월" : "mo"}</span>
                </div>
                <ul className="plan-features">
                  <li>{lang === "ko" ? `객실 ${p.features.rooms === "unlimited" ? "무제한" : p.features.rooms}` : `${p.features.rooms === "unlimited" ? "Unlimited" : p.features.rooms} rooms`}</li>
                  <li>{lang === "ko" ? `채널 ${p.features.channels === "unlimited" ? "무제한" : p.features.channels}` : `${p.features.channels === "unlimited" ? "Unlimited" : p.features.channels} channels`}</li>
                  <li>{lang === "ko" ? `이메일 ${p.features.emails === "unlimited" ? "무제한" : `${p.features.emails}/월`}` : `${p.features.emails === "unlimited" ? "Unlimited" : p.features.emails}/mo emails`}</li>
                </ul>
                <button
                  className={`btn sm ${isCurrent ? "ghost" : "primary"}`}
                  disabled={pendingPlan !== null || isCurrent}
                  onClick={() => onSelect(p.id)}
                >
                  {pendingPlan === p.id
                    ? "…"
                    : isCurrent
                    ? (lang === "ko" ? "현재 플랜" : "Current plan")
                    : state.status === "trial"
                    ? (lang === "ko" ? "이 플랜으로 변환" : "Convert to this")
                    : (lang === "ko" ? "선택" : "Select")}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <style>{`
        .page { padding: 20px 24px 32px; display: flex; flex-direction: column; gap: 16px; }
        .header h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin: 4px 0 2px; color: var(--t-1); }
        .back-link { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; text-decoration: none; }
        .header .sub { font-size: 12px; }
        .alert { padding: 8px 12px; border-radius: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px; background: var(--bad-soft); color: var(--bad); }
        .lock-banner { margin: 0 16px 12px; padding: 10px 14px; background: var(--warn-soft); color: var(--warn); border-radius: 6px; font-size: 12px; display: flex; gap: 6px; align-items: center; }
        .plan-grid { padding: 16px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .plan { padding: 16px; border: 1px solid var(--bd-1); border-radius: 8px; background: var(--bg-elev); display: flex; flex-direction: column; gap: 10px; }
        .plan.current { border-color: var(--acc); box-shadow: 0 0 0 1px var(--acc); }
        .plan-name { font-weight: 600; font-size: 14px; color: var(--t-1); }
        .plan-price { font-size: 22px; font-weight: 700; color: var(--t-1); }
        .plan-price .per { font-size: 11px; color: var(--t-3); margin-left: 2px; font-weight: 500; }
        .plan-features { margin: 0; padding: 0 0 0 16px; font-size: 12px; color: var(--t-2); display: flex; flex-direction: column; gap: 4px; }
        .pill { padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; display: inline-flex; align-items: center; gap: 4px; }
        .pill.ok    { background: var(--ok-soft); color: var(--ok); }
        .pill.info  { background: var(--acc-soft); color: var(--acc); }
        .pill.bad   { background: var(--bad-soft); color: var(--bad); }
        .pill.muted { background: var(--bg-mute); color: var(--t-3); }
      `}</style>
    </div>
  );
}
