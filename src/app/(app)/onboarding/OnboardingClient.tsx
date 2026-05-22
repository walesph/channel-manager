"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { I } from "@/components/icons";
import { CHANNELS } from "@/lib/i18n";
import type { OnboardingStatus } from "@/lib/queries";
import { completeOnboarding, connectFirstChannel, createFirstRoomType } from "@/lib/actions";
import type { ChannelType } from "@prisma/client";

const STEPS = ["info", "rooms", "channels", "done"] as const;
type Step = (typeof STEPS)[number];

/**
 * 4-step onboarding walkthrough. Step state is derived from server-side
 * counts (rooms / channels exist?) plus a final "done" step the user
 * explicitly clicks. Skipping is allowed but explicit — clicking the
 * stepper jumps without losing form state.
 */
export function OnboardingClient({ status }: { status: OnboardingStatus }) {
  const { lang } = useApp();
  const router = useRouter();
  const [step, setStep] = useState<Step>(status.step === "done" ? "info" : status.step);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Step 2 form state
  const [rtName, setRtName] = useState("");
  const [rtRate, setRtRate] = useState("100000");
  const [rtCap, setRtCap] = useState("2");
  const [rtCount, setRtCount] = useState("5");

  // Step 3 form state
  const [pickedChannels, setPickedChannels] = useState<Set<ChannelType>>(new Set(["direct"]));

  const stepIdx = STEPS.indexOf(step);
  const stepLabel = (s: Step) => {
    const ko = ["호텔 정보", "객실 타입", "채널 연결", "완료"];
    const en = ["Hotel info", "Room types", "Channels", "Finish"];
    return lang === "ko" ? ko[STEPS.indexOf(s)] : en[STEPS.indexOf(s)];
  };

  const advance = (next: Step) => {
    setError(null);
    setStep(next);
  };

  const onCreateRoomType = () => {
    setError(null);
    startTransition(async () => {
      const r = await createFirstRoomType({
        name: rtName,
        baseRate: parseInt(rtRate, 10),
        capacity: parseInt(rtCap, 10),
        initialRoomCount: rtCount ? parseInt(rtCount, 10) : 0,
      });
      if ("ok" in r && r.ok) {
        advance("channels");
        router.refresh();
      } else if ("error" in r) {
        setError(r.error);
      }
    });
  };

  const onConnectChannels = async () => {
    setError(null);
    startTransition(async () => {
      for (const t of pickedChannels) {
        const r = await connectFirstChannel({ type: t });
        if (!("ok" in r) || !r.ok) {
          setError("error" in r ? r.error : "unknown error");
          return;
        }
      }
      advance("done");
      router.refresh();
    });
  };

  const onFinish = () => {
    setError(null);
    startTransition(async () => {
      const r = await completeOnboarding();
      if ("ok" in r && r.ok) {
        router.push("/");
        router.refresh();
      } else if ("error" in r) {
        setError(r.error);
      }
    });
  };

  return (
    <div className="page">
      <div className="header">
        <div className="logo-mark">S</div>
        <h1>{lang === "ko" ? `${status.hotelName}에 오신 걸 환영합니다` : `Welcome to ${status.hotelName}`}</h1>
        <div className="sub text-muted">
          {lang === "ko" ? "4단계로 운영을 시작하세요. 언제든 건너뛸 수 있습니다." : "Start operating in 4 steps. Skip anytime."}
        </div>
      </div>

      <div className="stepper">
        {STEPS.map((s, i) => (
          <button key={s} className={`step ${step === s ? "active" : ""} ${i < stepIdx ? "done" : ""}`} onClick={() => setStep(s)}>
            <span className="num">{i + 1}</span>
            <span className="lbl">{stepLabel(s)}</span>
          </button>
        ))}
      </div>

      {error && <div className="alert bad"><I.warn size={12} /> {error}</div>}

      {step === "info" && (
        <section className="card">
          <div className="sec-h"><div className="title">{lang === "ko" ? "호텔 정보" : "Hotel info"}</div></div>
          <div className="info-body">
            <p>
              {lang === "ko"
                ? "기본 호텔 정보가 이미 등록되어 있습니다. 이름, 시간대, 통화는 설정에서 언제든 변경할 수 있어요."
                : "Your hotel basics are already on file. Update the name, timezone, and currency anytime from Settings."}
            </p>
            <div className="info-grid">
              <div className="info-tile"><div className="lbl">{lang === "ko" ? "호텔" : "Hotel"}</div><div className="val">{status.hotelName}</div></div>
              <div className="info-tile"><div className="lbl">{lang === "ko" ? "객실 타입" : "Room types"}</div><div className="val">{status.hasRoomTypes ? "✓" : "—"}</div></div>
              <div className="info-tile"><div className="lbl">{lang === "ko" ? "채널" : "Channels"}</div><div className="val">{status.hasChannels ? "✓" : "—"}</div></div>
            </div>
            <div className="actions">
              <button className="btn primary" onClick={() => advance("rooms")}>
                {lang === "ko" ? "다음 — 객실 타입 추가" : "Next — add room types"} →
              </button>
            </div>
          </div>
        </section>
      )}

      {step === "rooms" && (
        <section className="card">
          <div className="sec-h">
            <div>
              <div className="title">{lang === "ko" ? "첫 객실 타입" : "Your first room type"}</div>
              <div className="sub">{lang === "ko" ? "예: 디럭스 트윈, 패밀리 스위트" : "e.g. Deluxe Twin, Family Suite"}</div>
            </div>
          </div>
          <div className="form">
            <div className="row">
              <label>{lang === "ko" ? "이름" : "Name"}</label>
              <input type="text" value={rtName} onChange={(e) => setRtName(e.target.value)} placeholder={lang === "ko" ? "예: 디럭스 트윈" : "e.g. Deluxe Twin"} disabled={pending} maxLength={80} />
            </div>
            <div className="row">
              <label>{lang === "ko" ? "기본가 (KRW)" : "Base rate (KRW)"}</label>
              <input type="number" value={rtRate} onChange={(e) => setRtRate(e.target.value)} disabled={pending} min={1000} step={1000} />
            </div>
            <div className="row">
              <label>{lang === "ko" ? "최대 인원" : "Max guests"}</label>
              <input type="number" value={rtCap} onChange={(e) => setRtCap(e.target.value)} disabled={pending} min={1} max={20} />
            </div>
            <div className="row">
              <label>{lang === "ko" ? "객실 수" : "Number of rooms"}</label>
              <input type="number" value={rtCount} onChange={(e) => setRtCount(e.target.value)} disabled={pending} min={0} max={50} />
              <span className="hint text-muted">{lang === "ko" ? "(101호부터 자동 번호)" : "(auto-numbered from 101)"}</span>
            </div>
            <div className="actions">
              <button className="btn ghost" onClick={() => advance("info")} disabled={pending}>← {lang === "ko" ? "이전" : "Back"}</button>
              <div style={{ flex: 1 }} />
              {status.hasRoomTypes && (
                <button className="btn ghost" onClick={() => advance("channels")} disabled={pending}>
                  {lang === "ko" ? "건너뛰기" : "Skip"} →
                </button>
              )}
              <button className="btn primary" onClick={onCreateRoomType} disabled={pending || !rtName.trim()}>
                {pending ? "…" : lang === "ko" ? "생성 + 다음" : "Create + next"}
              </button>
            </div>
          </div>
        </section>
      )}

      {step === "channels" && (
        <section className="card">
          <div className="sec-h">
            <div>
              <div className="title">{lang === "ko" ? "채널 연결" : "Connect channels"}</div>
              <div className="sub">{lang === "ko" ? "고객을 모을 OTA를 선택하세요. 나중에 추가/제거 가능합니다." : "Pick where you'll source bookings. You can change this later."}</div>
            </div>
          </div>
          <div className="ch-grid">
            {CHANNELS.map((c) => {
              const checked = pickedChannels.has(c.id as ChannelType);
              return (
                <label key={c.id} className={`ch-tile ${checked ? "checked" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setPickedChannels((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.id as ChannelType)) next.delete(c.id as ChannelType);
                        else next.add(c.id as ChannelType);
                        return next;
                      });
                    }}
                    disabled={pending}
                  />
                  <span className={`dot ${c.cls}`} />
                  <span className="ch-name">{c.name}</span>
                  {checked && <I.check size={11} style={{ marginLeft: "auto", color: "var(--acc)" }} />}
                </label>
              );
            })}
          </div>
          <div className="actions" style={{ padding: "0 16px 16px" }}>
            <button className="btn ghost" onClick={() => advance("rooms")} disabled={pending}>← {lang === "ko" ? "이전" : "Back"}</button>
            <div style={{ flex: 1 }} />
            <button className="btn primary" onClick={onConnectChannels} disabled={pending || pickedChannels.size === 0}>
              {pending ? "…" : lang === "ko" ? `${pickedChannels.size}개 연결 + 다음` : `Connect ${pickedChannels.size} + next`}
            </button>
          </div>
        </section>
      )}

      {step === "done" && (
        <section className="card success">
          <div className="success-body">
            <I.check size={36} />
            <div className="title">{lang === "ko" ? "준비 완료!" : "All set!"}</div>
            <p className="text-muted">
              {lang === "ko"
                ? "이제 대시보드에서 예약, 가격, 메시지를 한 곳에서 관리할 수 있습니다."
                : "From here, you'll manage bookings, rates, and messages in one place."}
            </p>
            <button className="btn primary" onClick={onFinish} disabled={pending}>
              {pending ? "…" : lang === "ko" ? "대시보드로 →" : "Go to dashboard →"}
            </button>
          </div>
        </section>
      )}

      <style>{`
        .page { padding: 32px 24px; max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
        .header { text-align: center; padding: 8px 0 16px; }
        .logo-mark { width: 48px; height: 48px; background: var(--acc); color: white; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; }
        .header h1 { font-size: 24px; font-weight: 600; letter-spacing: -0.02em; margin: 12px 0 4px; color: var(--t-1); }
        .header .sub { font-size: 13px; }
        .alert { padding: 8px 12px; border-radius: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px; background: var(--bad-soft); color: var(--bad); }

        .stepper { display: flex; gap: 6px; padding: 8px 0; justify-content: center; }
        .step { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 6px; border: 1px solid var(--bd-1); background: var(--bg-elev); font: inherit; font-size: 12px; color: var(--t-3); cursor: pointer; }
        .step.active { background: var(--acc); border-color: var(--acc); color: white; }
        .step.done { background: var(--ok-soft); border-color: var(--ok); color: var(--ok); }
        .step .num { font-weight: 700; opacity: 0.7; }
        .step.active .num { opacity: 1; }
        .step .lbl { font-weight: 500; }

        .info-body { padding: 16px; }
        .info-body p { margin: 0 0 14px; font-size: 13px; color: var(--t-2); line-height: 1.6; }
        .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .info-tile { padding: 10px 12px; background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: 6px; }
        .info-tile .lbl { color: var(--t-3); font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500; }
        .info-tile .val { font-size: 14px; font-weight: 600; color: var(--t-1); margin-top: 2px; }

        .form { padding: 16px; display: flex; flex-direction: column; gap: 10px; max-width: 480px; margin: 0 auto; }
        .row { display: grid; grid-template-columns: 130px 1fr auto; gap: 10px; align-items: center; }
        .row label { color: var(--t-3); font-size: 12px; font-weight: 500; }
        .row input { height: 32px; padding: 0 10px; border: 1px solid var(--bd-1); border-radius: 6px; background: var(--bg-elev); color: var(--t-1); font: inherit; font-size: 13px; }
        .row .hint { font-size: 11px; }

        .ch-grid { padding: 16px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
        .ch-tile { display: inline-flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--bd-1); border-radius: 6px; cursor: pointer; transition: border-color .12s, background .12s; }
        .ch-tile.checked { border-color: var(--acc); background: var(--acc-soft); }
        .ch-tile input { margin: 0; }
        .ch-tile .dot { width: 8px; height: 8px; border-radius: 2px; flex: 0 0 8px; }
        .ch-tile .ch-name { font-size: 13px; font-weight: 500; color: var(--t-1); }

        .actions { display: flex; align-items: center; gap: 8px; padding: 12px 0 4px; }
        .success-body { padding: 40px 16px; display: flex; flex-direction: column; align-items: center; gap: 10px; color: var(--ok); }
        .success-body .title { font-size: 18px; font-weight: 600; color: var(--t-1); }
        .success-body p { max-width: 360px; text-align: center; font-size: 13px; line-height: 1.6; margin: 0; }
      `}</style>
    </div>
  );
}
