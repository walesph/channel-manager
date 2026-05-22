"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { I } from "../icons";
import { CHANNELS, type ChannelId, type Lang } from "@/lib/i18n";
import { createBooking } from "@/lib/actions";
import type { ChannelType } from "@prisma/client";
import type { RoomTypeOption } from "@/lib/queries";

interface NewBookingModalProps {
  lang: Lang;
  open: boolean;
  onClose: () => void;
  roomTypes: RoomTypeOption[];
}

function todayIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const CHANNEL_OPTIONS: ChannelId[] = ["airbnb", "booking", "agoda", "trip", "direct", "fb"];

export function NewBookingModal({ lang, open, onClose, roomTypes }: NewBookingModalProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("KR");
  const [roomTypeId, setRoomTypeId] = useState(roomTypes[0]?.id ?? "");
  const [channel, setChannel] = useState<ChannelId>("direct");
  const [checkIn, setCheckIn] = useState(todayIso());
  const [checkOut, setCheckOut] = useState(addDaysIso(todayIso(), 2));

  if (!open) return null;

  const submit = () => {
    setError(null);
    setOk(null);
    if (!name.trim()) {
      setError(lang === "ko" ? "게스트 이름을 입력하세요." : "Guest name required");
      return;
    }
    if (!roomTypeId) {
      setError(lang === "ko" ? "객실 타입을 선택하세요." : "Pick a room type");
      return;
    }
    startTransition(async () => {
      const result = await createBooking({
        guestName: name,
        guestEmail: email || undefined,
        guestCountry: country || undefined,
        roomTypeId,
        channelType: channel as unknown as ChannelType,
        checkIn,
        checkOut,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOk(
        lang === "ko"
          ? `예약 생성됨 · ${result.nights}박 · ₩${result.total.toLocaleString()}`
          : `Booking created · ${result.nights}n · ₩${result.total.toLocaleString()}`,
      );
      router.refresh();
      setTimeout(() => {
        onClose();
        // Reset form
        setName("");
        setEmail("");
        setCountry("KR");
        setRoomTypeId(roomTypes[0]?.id ?? "");
        setChannel("direct");
        setCheckIn(todayIso());
        setCheckOut(addDaysIso(todayIso(), 2));
        setOk(null);
      }, 1000);
    });
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="md-head">
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{lang === "ko" ? "신규 예약" : "New booking"}</div>
            <div className="text-muted" style={{ fontSize: 12 }}>
              {lang === "ko" ? "수동으로 직접 예약 추가" : "Add a direct booking manually"}
            </div>
          </div>
          <button className="btn ghost icon" onClick={onClose} disabled={pending}><I.close size={14} /></button>
        </div>

        <div className="md-body">
          <div className="field-grid">
            <label className="field">
              <span>{lang === "ko" ? "게스트 이름" : "Guest name"} *</span>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={lang === "ko" ? "홍길동" : "Jane Doe"}
              />
            </label>
            <label className="field">
              <span>{lang === "ko" ? "이메일" : "Email"}</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="guest@example.com"
              />
            </label>
            <label className="field">
              <span>{lang === "ko" ? "국가" : "Country"}</span>
              <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="KR">🇰🇷 KR</option>
                <option value="JP">🇯🇵 JP</option>
                <option value="CN">🇨🇳 CN</option>
                <option value="US">🇺🇸 US</option>
                <option value="DE">🇩🇪 DE</option>
                <option value="GB">🇬🇧 GB</option>
                <option value="FR">🇫🇷 FR</option>
                <option value="SE">🇸🇪 SE</option>
                <option value="TW">🇹🇼 TW</option>
              </select>
            </label>
            <label className="field">
              <span>{lang === "ko" ? "채널" : "Channel"}</span>
              <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as ChannelId)}>
                {CHANNEL_OPTIONS.map((c) => {
                  const ch = CHANNELS.find((x) => x.id === c)!;
                  return (
                    <option key={c} value={c}>
                      {ch.name}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="field" style={{ gridColumn: "span 2" }}>
              <span>{lang === "ko" ? "객실 타입" : "Room type"} *</span>
              <select className="input" value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)}>
                {roomTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.name} · ₩{rt.baseRate.toLocaleString()}/박 · {rt.capacity}{lang === "ko" ? "인" : "p"}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{lang === "ko" ? "체크인" : "Check-in"}</span>
              <input
                className="input"
                type="date"
                value={checkIn}
                onChange={(e) => {
                  setCheckIn(e.target.value);
                  if (e.target.value >= checkOut) setCheckOut(addDaysIso(e.target.value, 1));
                }}
              />
            </label>
            <label className="field">
              <span>{lang === "ko" ? "체크아웃" : "Check-out"}</span>
              <input
                className="input"
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                min={addDaysIso(checkIn, 1)}
              />
            </label>
          </div>
          {error && <div className="msg-err">{error}</div>}
          {ok && <div className="msg-ok">{ok}</div>}
        </div>

        <div className="md-foot">
          <span className="text-muted" style={{ fontSize: 11 }}>
            {lang === "ko" ? "총액은 채널의 Standard 요금으로 자동 계산됩니다." : "Total auto-calculated from channel Standard rate."}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn ghost sm" onClick={onClose} disabled={pending}>
              {lang === "ko" ? "취소" : "Cancel"}
            </button>
            <button className="btn primary" onClick={submit} disabled={pending}>
              {pending ? (lang === "ko" ? "생성 중…" : "Creating…") : (lang === "ko" ? "예약 생성" : "Create booking")}
            </button>
          </div>
        </div>

        <style>{`
          .modal-bg { position: fixed; inset: 0; background: rgba(15,15,20,0.5); display: flex; align-items: center; justify-content: center; z-index: 100;}
          .modal { width: 540px; max-width: calc(100vw - 32px); background: var(--bg-elev); border: 1px solid var(--bd-2); border-radius: var(--r-lg); box-shadow: var(--shadow-pop); overflow: hidden;}
          .md-head { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--bd-1);}
          .md-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 12px;}
          .md-foot { padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--bd-1); background: var(--bg-1); gap: 12px;}
          .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; }
          .field { display: flex; flex-direction: column; gap: 4px; }
          .field > span { font-size: var(--fs-xs); color: var(--t-3); font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; }
          .field .input { height: 32px; }
          .field select.input { padding-right: 28px; }
          .msg-err { font-size: 12px; color: var(--bad); background: var(--bad-soft); padding: 8px 10px; border-radius: var(--r-sm); }
          .msg-ok { font-size: 12px; color: var(--ok); background: var(--ok-soft); padding: 8px 10px; border-radius: var(--r-sm); }
        `}</style>
      </div>
    </div>
  );
}
