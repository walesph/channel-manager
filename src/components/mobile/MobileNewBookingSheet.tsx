"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { I } from "../icons";
import { CHANNELS, type ChannelId, type Lang } from "@/lib/i18n";
import { createBooking } from "@/lib/actions";
import type { ChannelType } from "@prisma/client";
import type { RoomTypeOption } from "@/lib/queries";

interface Props {
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

export function MobileNewBookingSheet({ lang, open, onClose, roomTypes }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
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
    if (!name.trim()) {
      setError(lang === "ko" ? "이름을 입력하세요." : "Name required");
      return;
    }
    startTransition(async () => {
      const r = await createBooking({
        guestName: name,
        guestEmail: email || undefined,
        guestCountry: country,
        roomTypeId,
        channelType: channel as unknown as ChannelType,
        checkIn,
        checkOut,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      onClose();
      setName("");
      setEmail("");
      setCheckIn(todayIso());
      setCheckOut(addDaysIso(todayIso(), 2));
    });
  };

  return (
    <div className="m-sheet">
      <div className="m-sheet-head">
        <button className="btn ghost" onClick={onClose} disabled={pending} style={{ height: 36 }}>
          <I.close size={16} />
        </button>
        <div style={{ flex: 1, fontWeight: 600, fontSize: 16 }}>
          {lang === "ko" ? "신규 예약" : "New booking"}
        </div>
        <button className="btn primary" onClick={submit} disabled={pending} style={{ height: 36 }}>
          {pending ? "…" : lang === "ko" ? "생성" : "Create"}
        </button>
      </div>

      <div className="m-sheet-body">
        <label className="m-field">
          <span>{lang === "ko" ? "게스트 이름" : "Name"} *</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" />
        </label>
        <label className="m-field">
          <span>{lang === "ko" ? "이메일" : "Email"}</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="guest@example.com" />
        </label>
        <div className="m-field-row">
          <label className="m-field">
            <span>{lang === "ko" ? "국가" : "Country"}</span>
            <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="KR">🇰🇷 KR</option>
              <option value="JP">🇯🇵 JP</option>
              <option value="CN">🇨🇳 CN</option>
              <option value="US">🇺🇸 US</option>
              <option value="DE">🇩🇪 DE</option>
            </select>
          </label>
          <label className="m-field">
            <span>{lang === "ko" ? "채널" : "Channel"}</span>
            <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as ChannelId)}>
              {CHANNEL_OPTIONS.map((c) => {
                const ch = CHANNELS.find((x) => x.id === c)!;
                return <option key={c} value={c}>{ch.name}</option>;
              })}
            </select>
          </label>
        </div>
        <label className="m-field">
          <span>{lang === "ko" ? "객실 타입" : "Room type"} *</span>
          <select className="input" value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)}>
            {roomTypes.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.name} · ₩{(rt.baseRate / 1000).toFixed(0)}K
              </option>
            ))}
          </select>
        </label>
        <div className="m-field-row">
          <label className="m-field">
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
          <label className="m-field">
            <span>{lang === "ko" ? "체크아웃" : "Check-out"}</span>
            <input className="input" type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} min={addDaysIso(checkIn, 1)} />
          </label>
        </div>
        {error && <div className="m-err">{error}</div>}
        <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
          {lang === "ko" ? "총액은 채널 Standard 요금으로 자동 계산됩니다." : "Total auto-calculated."}
        </div>
      </div>

      <style>{`
        .m-sheet { position: fixed; inset: 0; background: var(--bg); z-index: 200; display: flex; flex-direction: column; }
        .m-sheet-head { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--bd-1); background: var(--bg-elev); }
        .m-sheet-body { flex: 1; overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
        .m-field { display: flex; flex-direction: column; gap: 4px; }
        .m-field > span { font-size: 11px; color: var(--t-3); font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; }
        .m-field .input { height: 40px; font-size: 14px; }
        .m-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .m-err { font-size: 12px; color: var(--bad); background: var(--bad-soft); padding: 8px 10px; border-radius: var(--r-sm); }
      `}</style>
    </div>
  );
}
