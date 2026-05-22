"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { I } from "../icons";
import { CHANNELS, channelById, type ChannelId, type Lang } from "@/lib/i18n";
import type { BookingRow, BookingTimelineEvent, RoomConflictRow, RoomTypeOption } from "@/lib/queries";
import type { BookingEventType, BookingRequestType, BookingStatus, PaymentStatus } from "@prisma/client";
import { assignBookingRoom, createBookingCheckoutSession, createSavedFilter, sendMessage, setBookingNotes, setBookingStatus, type BookingStatusAction } from "@/lib/actions";
import { NewBookingModal } from "./NewBookingModal";

const stripeEnabledPublic = !!process.env.NEXT_PUBLIC_STRIPE_ENABLED;

const StatusPill = ({ s, lang }: { s: BookingStatus; lang: Lang }) => {
  if (s === "confirmed") return <span className="pill ok dot">{lang === "ko" ? "확정" : "Confirmed"}</span>;
  if (s === "in_house") return <span className="pill info dot">{lang === "ko" ? "재실" : "In-house"}</span>;
  if (s === "cancelled") return <span className="pill bad dot">{lang === "ko" ? "취소" : "Cancelled"}</span>;
  return <span className="pill warn dot">{lang === "ko" ? "퇴실" : "Checked out"}</span>;
};

function formatMd(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

function formatLongDate(iso: string, lang: Lang): { day: string; sub: string } {
  const d = new Date(`${iso}T00:00:00Z`);
  const month = d.getUTCMonth() + 1;
  const dom = d.getUTCDate();
  const dow = d.getUTCDay();
  const dowKo = ["일", "월", "화", "수", "목", "금", "토"][dow];
  const dowEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow];
  if (lang === "ko") return { day: `${month}월 ${dom}일`, sub: `${dowKo}요일 15:00` };
  return { day: `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]} ${dom}`, sub: `${dowEn} · 15:00` };
}

function formatTimestamp(iso: string, lang: Lang): string {
  const d = new Date(iso);
  const m = d.getMonth() + 1;
  const dom = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return lang === "ko" ? `${m}/${dom} ${hh}:${mm}` : `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]} ${dom} ${hh}:${mm}`;
}

const REQUEST_ICONS: Record<BookingRequestType, "bed" | "user" | "info" | "calCheck"> = {
  bed: "bed",
  checkin: "user",
  dietary: "info",
  note: "calCheck",
};

interface EventSource {
  label: string;
  cls: "hostaway" | "auto" | "ical" | "stripe" | "ota";
  cleanedBody: string;
}

function parseEventSource(body: string | null): EventSource | null {
  if (!body) return null;
  // "via Hostaway (mock, matched listing AGODA-스위트킹)"
  const hwMatch = body.match(/^via\s+Hostaway\s*\(([^)]+)\)\s*$/i);
  if (hwMatch) return { label: `Hostaway · ${hwMatch[1]}`, cls: "hostaway", cleanedBody: "" };
  // "auto:checkin-reminder" / "auto:review-request" / "auto: no-show"
  const autoMatch = body.match(/^auto[:\s]+(.+)$/i);
  if (autoMatch) return { label: `자동 · ${autoMatch[1]}`, cls: "auto", cleanedBody: "" };
  // iCal pull tags
  const icalMatch = body.match(/^via\s+iCal\s*(?:\(([^)]+)\))?\s*$/i);
  if (icalMatch) return { label: `iCal${icalMatch[1] ? ` · ${icalMatch[1]}` : ""}`, cls: "ical", cleanedBody: "" };
  // Stripe checkout reference
  if (/stripe|cs_test_|pi_/.test(body)) return { label: "Stripe", cls: "stripe", cleanedBody: body };
  return null;
}

const EVENT_LABELS: Record<BookingEventType, { ko: string; en: string }> = {
  created: { ko: "예약 생성", en: "Booking created" },
  payment_captured: { ko: "결제 완료", en: "Payment captured" },
  payment_failed: { ko: "결제 실패", en: "Payment failed" },
  payment_refunded: { ko: "환불 처리", en: "Payment refunded" },
  confirmation_sent: { ko: "확인 메일 발송", en: "Confirmation sent" },
  message_received: { ko: "게스트 메시지", en: "Guest message" },
  checked_in: { ko: "체크인", en: "Checked in" },
  checked_out: { ko: "체크아웃", en: "Checked out" },
  cancelled: { ko: "예약 취소", en: "Booking cancelled" },
  self_check_in: { ko: "셀프 체크인", en: "Self check-in" },
};

export interface BookingsFilterState {
  q: string;
  channels: ChannelId[];
  statuses: BookingStatus[];
  startDate: string;
  endDate: string;
}

export interface BookingsPaginationState {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

interface BookingsProps {
  lang?: Lang;
  bookings: BookingRow[];
  roomTypeOptions: RoomTypeOption[];
  filter?: BookingsFilterState;
  pagination?: BookingsPaginationState;
  conflicts?: RoomConflictRow[];
}

interface OptimisticPatch {
  id: string;
  status?: BookingStatus;
  payment?: PaymentStatus;
}

function predictNext(current: BookingRow, action: BookingStatusAction): OptimisticPatch | null {
  switch (action) {
    case "check_in":
      if (current.status !== "confirmed") return null;
      return { id: current.id, status: "in_house" };
    case "check_out":
      if (current.status !== "in_house") return null;
      return { id: current.id, status: "checked_out" };
    case "cancel":
      if (current.status === "cancelled" || current.status === "checked_out") return null;
      return {
        id: current.id,
        status: "cancelled",
        payment: current.payment === "paid" ? "refunded" : current.payment,
      };
    case "mark_paid":
      if (current.payment === "paid") return null;
      return { id: current.id, payment: "paid" };
    case "mark_refunded":
      if (current.payment !== "paid") return null;
      return { id: current.id, payment: "refunded" };
  }
}

type FilterKey = "all" | "confirmed" | "in_house" | "cancelled";

export const Bookings = ({ lang = "ko", bookings, roomTypeOptions, filter: initialFilter, pagination, conflicts = [] }: BookingsProps) => {
  const router = useRouter();
  const [optimisticBookings, addOptimistic] = useOptimistic(bookings, (state, patch: OptimisticPatch) =>
    state.map((b) =>
      b.id === patch.id
        ? { ...b, status: patch.status ?? b.status, payment: patch.payment ?? b.payment }
        : b,
    ),
  );
  // Status filter (top tabs) — derived from URL `status=` (single picked) or "all".
  const initStatusTab: FilterKey = (() => {
    if (!initialFilter || initialFilter.statuses.length !== 1) return "all";
    const s = initialFilter.statuses[0];
    return s === "confirmed" || s === "in_house" || s === "cancelled" ? s : "all";
  })();
  const [filter, setFilter] = useState<FilterKey>(initStatusTab);
  const [query, setQuery] = useState(initialFilter?.q ?? "");
  const [channelFilter, setChannelFilter] = useState<ChannelId | "all">(
    initialFilter && initialFilter.channels.length === 1 ? initialFilter.channels[0] : "all",
  );
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | "all">("all");
  const [dateFrom, setDateFrom] = useState(initialFilter?.startDate ?? "");
  const [dateTo, setDateTo] = useState(initialFilter?.endDate ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(
    !!(initialFilter && (initialFilter.startDate || initialFilter.endDate || initialFilter.channels.length > 0)),
  );

  // ── URL sync: debounced push to /bookings?... so filters survive refresh
  //    and are shareable. The server re-fetches on URL change.
  const isFirstSync = useRef(true);
  useEffect(() => {
    if (isFirstSync.current) {
      // Skip the initial mount sync — URL already matches the props that
      // hydrated our state, and pushing here would cause a redundant nav.
      isFirstSync.current = false;
      return;
    }
    const handle = setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (channelFilter !== "all") params.set("channel", channelFilter);
      if (filter !== "all") params.set("status", filter);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      // Filters changed → reset to page 0 so users don't get stranded on a
      // page that no longer has rows for the new filter.
      const qs = params.toString();
      router.replace(qs ? `/bookings?${qs}` : "/bookings", { scroll: false });
    }, 250);
    return () => clearTimeout(handle);
  }, [query, channelFilter, filter, dateFrom, dateTo, router]);
  const [selId, setSelId] = useState<string | null>(bookings[0]?.id ?? null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [notesPending, setNotesPending] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [warningPendingKind, setWarningPendingKind] = useState<string | null>(null);
  const [warningSavedKind, setWarningSavedKind] = useState<string | null>(null);
  const [conflictModal, setConflictModal] = useState<RoomConflictRow | null>(null);
  const handleWarningAction = (booking: BookingRow, w: { action: "mark_paid" | "mark_refunded" | "send_reminder" | null; kind: string }) => {
    if (!w.action) return;
    setWarningPendingKind(w.kind);
    setWarningSavedKind(null);
    startTransition(async () => {
      if (w.action === "mark_paid") {
        await setBookingStatus(booking.id, "mark_paid");
      } else if (w.action === "mark_refunded") {
        await setBookingStatus(booking.id, "mark_refunded");
      } else if (w.action === "send_reminder" && booking.threadId) {
        const reminder = `안녕하세요 ${booking.guest.name}님, 곧 체크인 일정입니다 (${booking.checkIn}). 아직 결제가 완료되지 않아 안내드립니다. 결제 링크가 필요하시면 알려주세요.`;
        await sendMessage(booking.threadId, reminder);
      }
      setWarningPendingKind(null);
      setWarningSavedKind(w.kind);
      router.refresh();
      setTimeout(() => setWarningSavedKind((k) => (k === w.kind ? null : k)), 1500);
    });
  };
  const saveNotes = (bookingId: string, value: string) => {
    setNotesPending(true);
    setNotesSaved(false);
    startTransition(async () => {
      const r = await setBookingNotes(bookingId, value);
      setNotesPending(false);
      if (r.ok) {
        setNotesSaved(true);
        router.refresh();
        setTimeout(() => setNotesSaved(false), 1500);
      }
    });
  };
  const [newOpen, setNewOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<BookingStatusAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const runAction = (booking: BookingRow, action: BookingStatusAction) => {
    setActionError(null);
    setPendingAction(action);
    const patch = predictNext(booking, action);
    startTransition(async () => {
      if (patch) addOptimistic(patch);
      const r = await setBookingStatus(booking.id, action);
      setPendingAction(null);
      if (!r.ok) {
        setActionError(r.error);
        // useOptimistic auto-reverts when the transition ends without router.refresh
      } else {
        router.refresh();
      }
    });
  };

  if (bookings.length === 0) {
    return (
      <>
        <div style={{ padding: 48, textAlign: "center", color: "var(--t-3)" }}>
          {lang === "ko" ? "예약이 없습니다." : "No bookings yet."}
          <div style={{ marginTop: 16 }}>
            <button className="btn primary" onClick={() => setNewOpen(true)}>
              <I.plus size={13} /> {lang === "ko" ? "신규 예약" : "New booking"}
            </button>
          </div>
        </div>
        <NewBookingModal lang={lang} open={newOpen} onClose={() => setNewOpen(false)} roomTypes={roomTypeOptions} />
      </>
    );
  }

  const cur = optimisticBookings.find((b) => b.id === selId) ?? optimisticBookings[0];
  const curCh = channelById(cur.channel)!;
  const ci = formatLongDate(cur.checkIn, lang);
  const co = formatLongDate(cur.checkOut, lang);
  co.sub = co.sub.replace("15:00", "11:00");

  const counts = {
    all: optimisticBookings.length,
    confirmed: optimisticBookings.filter((b) => b.status === "confirmed").length,
    in_house: optimisticBookings.filter((b) => b.status === "in_house").length,
    cancelled: optimisticBookings.filter((b) => b.status === "cancelled").length,
  };

  const trimmedQuery = query.trim().toLowerCase();
  const displayed = optimisticBookings.filter((b) => {
    if (filter !== "all" && b.status !== filter) return false;
    if (channelFilter !== "all" && b.channel !== channelFilter) return false;
    if (paymentFilter !== "all" && b.payment !== paymentFilter) return false;
    if (dateFrom && b.checkOut < dateFrom) return false;
    if (dateTo && b.checkIn > dateTo) return false;
    if (!trimmedQuery) return true;
    return (
      b.guest.name.toLowerCase().includes(trimmedQuery) ||
      (b.externalRef?.toLowerCase().includes(trimmedQuery) ?? false) ||
      b.roomType.name.toLowerCase().includes(trimmedQuery) ||
      b.roomNumber?.toLowerCase().includes(trimmedQuery) ||
      false
    );
  });

  const exportCsv = () => {
    const headers = [
      "ID",
      "ExternalRef",
      "Status",
      "Payment",
      "Channel",
      "Guest",
      "Email",
      "Phone",
      "Country",
      "RoomType",
      "Room",
      "CheckIn",
      "CheckOut",
      "Nights",
      "Total",
      "GuestStays",
      "GuestLifetimeRevenue",
      "GuestFirstStay",
    ];
    const escape = (v: unknown) => {
      const s = (v ?? "").toString();
      return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const b of displayed) {
      lines.push(
        [
          b.id,
          b.externalRef,
          b.status,
          b.payment,
          b.channel,
          b.guest.name,
          b.guest.email,
          b.guest.phone,
          b.guest.country,
          b.roomType.name,
          b.roomNumber,
          b.checkIn,
          b.checkOut,
          b.nights,
          b.total,
          b.guest.lifetime.bookingsCount,
          b.guest.lifetime.lifetimeRevenue,
          b.guest.lifetime.firstStayIso,
        ]
          .map(escape)
          .join(","),
      );
    }
    // BOM for Excel UTF-8 detection
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `bookings-${stamp}-${displayed.length}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const activeFilters: { label: string; clear: () => void }[] = [];
  if (channelFilter !== "all") {
    const ch = channelById(channelFilter);
    activeFilters.push({ label: `${lang === "ko" ? "채널" : "Channel"}: ${ch?.name ?? channelFilter}`, clear: () => setChannelFilter("all") });
  }
  if (paymentFilter !== "all") {
    const labels: Record<PaymentStatus, { ko: string; en: string }> = {
      paid: { ko: "결제 완료", en: "Paid" },
      pending: { ko: "결제 대기", en: "Pending" },
      failed: { ko: "결제 실패", en: "Failed" },
      refunded: { ko: "환불됨", en: "Refunded" },
    };
    activeFilters.push({ label: lang === "ko" ? labels[paymentFilter].ko : labels[paymentFilter].en, clear: () => setPaymentFilter("all") });
  }
  if (dateFrom) activeFilters.push({ label: `${lang === "ko" ? "이후" : "After"} ${dateFrom}`, clear: () => setDateFrom("") });
  if (dateTo) activeFilters.push({ label: `${lang === "ko" ? "이전" : "Before"} ${dateTo}`, clear: () => setDateTo("") });

  return (
    <div className="bk-wrap">
      <div className="bk-filters">
        <div className="seg">
          <button className={`seg-btn ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
            {lang === "ko" ? "모두" : "All"} <span className="num">{counts.all}</span>
          </button>
          <button className={`seg-btn ${filter === "confirmed" ? "active" : ""}`} onClick={() => setFilter("confirmed")}>
            {lang === "ko" ? "확정" : "Confirmed"} <span className="num">{counts.confirmed}</span>
          </button>
          <button className={`seg-btn ${filter === "in_house" ? "active" : ""}`} onClick={() => setFilter("in_house")}>
            {lang === "ko" ? "재실" : "In-house"} <span className="num">{counts.in_house}</span>
          </button>
          <button className={`seg-btn ${filter === "cancelled" ? "active" : ""}`} onClick={() => setFilter("cancelled")}>
            {lang === "ko" ? "취소" : "Cancelled"} <span className="num">{counts.cancelled}</span>
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <div className="search-bar">
          <I.search size={13} />
          <input
            placeholder={lang === "ko" ? "예약 ID, 이름, 객실…" : "Booking ID, name, room…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              className="btn ghost icon"
              style={{ width: 18, height: 18 }}
              onClick={() => setQuery("")}
              aria-label="clear"
            >
              <I.close size={11} />
            </button>
          )}
        </div>
        <button
          className={`btn sm ${activeFilters.length > 0 || advancedOpen ? "primary" : "ghost"}`}
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          <I.filter size={12} /> {lang === "ko" ? "필터" : "Filter"}
          {activeFilters.length > 0 && <span className="num" style={{ marginLeft: 4 }}>{activeFilters.length}</span>}
        </button>
        <button
          className="btn sm ghost"
          onClick={exportCsv}
          disabled={displayed.length === 0}
          title={lang === "ko" ? `${displayed.length}건 CSV 다운로드` : `Download ${displayed.length} as CSV`}
        >
          <I.download size={12} /> {lang === "ko" ? "내보내기" : "Export"}
        </button>
        <button className="btn sm primary" onClick={() => setNewOpen(true)}>
          <I.plus size={12} /> {lang === "ko" ? "신규" : "New"}
        </button>
      </div>

      {advancedOpen && (
        <div className="bk-advanced">
          <div className="adv-row">
            <label className="adv-field">
              <span>{lang === "ko" ? "채널" : "Channel"}</span>
              <select className="input" value={channelFilter} onChange={(e) => setChannelFilter(e.target.value as ChannelId | "all")}>
                <option value="all">{lang === "ko" ? "모든 채널" : "All channels"}</option>
                {CHANNELS.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="adv-field">
              <span>{lang === "ko" ? "결제" : "Payment"}</span>
              <select className="input" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as PaymentStatus | "all")}>
                <option value="all">{lang === "ko" ? "모두" : "All"}</option>
                <option value="paid">{lang === "ko" ? "완료" : "Paid"}</option>
                <option value="pending">{lang === "ko" ? "대기" : "Pending"}</option>
                <option value="failed">{lang === "ko" ? "실패" : "Failed"}</option>
                <option value="refunded">{lang === "ko" ? "환불" : "Refunded"}</option>
              </select>
            </label>
            <label className="adv-field">
              <span>{lang === "ko" ? "체크인 이후" : "Check-in from"}</span>
              <input type="date" className="input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label className="adv-field">
              <span>{lang === "ko" ? "체크아웃 이전" : "Check-out before"}</span>
              <input type="date" className="input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
            <button
              className="btn sm ghost"
              onClick={() => {
                setChannelFilter("all");
                setPaymentFilter("all");
                setDateFrom("");
                setDateTo("");
              }}
            >
              {lang === "ko" ? "초기화" : "Reset"}
            </button>
          </div>
        </div>
      )}

      {activeFilters.length > 0 && (
        <div className="active-chips">
          {activeFilters.map((f, i) => (
            <button key={i} className="active-chip" onClick={f.clear} title={lang === "ko" ? "제거" : "Clear"}>
              {f.label} <I.close size={10} />
            </button>
          ))}
          <button
            className="active-chip save-chip"
            onClick={async () => {
              const label = prompt(lang === "ko" ? "필터 이름 (예: VIP 게스트):" : "Filter name (e.g. VIP only):");
              if (!label) return;
              const params: Record<string, string> = {};
              if (query.trim()) params.q = query.trim();
              if (channelFilter !== "all") params.channel = channelFilter;
              if (filter !== "all") params.status = filter;
              if (dateFrom) params.from = dateFrom;
              if (dateTo) params.to = dateTo;
              const r = await createSavedFilter({ scope: "bookings", label, params });
              if (!("ok" in r) || !r.ok) {
                alert("error" in r ? r.error : "failed");
                return;
              }
              router.refresh();
            }}
            title={lang === "ko" ? "현재 필터 저장" : "Save this filter"}
          >
            <I.plus size={10} /> {lang === "ko" ? "저장" : "Save"}
          </button>
          <span className="text-muted" style={{ fontSize: 11, marginLeft: 4 }}>· {displayed.length} / {optimisticBookings.length}</span>
        </div>
      )}

      <NewBookingModal lang={lang} open={newOpen} onClose={() => setNewOpen(false)} roomTypes={roomTypeOptions} />

      {conflicts.length > 0 && (
        <ConflictBanner
          lang={lang}
          conflicts={conflicts}
          onOpen={() => setConflictModal(conflicts[0])}
          onResolve={(c) => setConflictModal(c)}
        />
      )}
      {conflictModal && (
        <ConflictModal
          lang={lang}
          conflict={conflictModal}
          onClose={() => setConflictModal(null)}
          onResolved={() => {
            setConflictModal(null);
            router.refresh();
          }}
        />
      )}

      <div className="bk-split">
        <div className="bk-list">
          {displayed.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: "var(--t-3)", fontSize: 13 }}>
              {lang === "ko" ? "조건에 맞는 예약이 없습니다." : "No bookings match the filter."}
            </div>
          )}
          {displayed.map((b) => {
            const c = channelById(b.channel)!;
            return (
              <button key={b.id} className={`bk-row ${selId === b.id ? "active" : ""}`} onClick={() => setSelId(b.id)}>
                <div className="bk-row-top">
                  <div className="bk-name">
                    <span className="flag">{b.guest.flag}</span>
                    {b.guest.name}
                  </div>
                  <div className="bk-total num">₩{(b.total / 1000).toLocaleString()}K</div>
                </div>
                <div className="bk-row-mid">
                  <span className="mini-ch"><span className={`dot ${c.cls}`} />{c.name}</span>
                  <span className="text-muted">·</span>
                  <span className="text-muted">{b.roomType.name}</span>
                </div>
                <div className="bk-row-bot">
                  <span className="num">{formatMd(b.checkIn)} → {formatMd(b.checkOut)}</span>
                  <span className="text-muted">· {b.nights}{lang === "ko" ? "박" : "n"}</span>
                  <StatusPill s={b.status} lang={lang} />
                </div>
              </button>
            );
          })}
          {pagination && pagination.total > pagination.pageSize && (
            <PaginationFooter pagination={pagination} lang={lang} />
          )}
        </div>

        <div className="bk-detail">
          <div className="bd-head">
            <div className="bd-id">
              <a
                className="bd-num mono"
                href={`/bookings/${cur.id}`}
                style={{ color: "inherit", textDecoration: "none" }}
                title={lang === "ko" ? "전체 화면으로 보기" : "Open in full page"}
              >
                #{cur.externalRef ?? cur.id.slice(-8).toUpperCase()}
              </a>
              <StatusPill s={cur.status} lang={lang} />
              <span className="mini-ch"><span className={`dot ${curCh.cls}`} />{curCh.name}</span>
              <span className="text-muted" style={{ fontSize: 12 }}>· {lang === "ko" ? "수신" : "Received"} {formatTimestamp(cur.createdAt, lang)}</span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {cur.status === "confirmed" && (
                <button className="btn sm primary" onClick={() => runAction(cur, "check_in")} disabled={!!pendingAction}>
                  <I.calCheck size={12} /> {pendingAction === "check_in" ? "…" : lang === "ko" ? "체크인 처리" : "Check in"}
                </button>
              )}
              {cur.status === "in_house" && (
                <button className="btn sm primary" onClick={() => runAction(cur, "check_out")} disabled={!!pendingAction}>
                  <I.check size={12} /> {pendingAction === "check_out" ? "…" : lang === "ko" ? "체크아웃 처리" : "Check out"}
                </button>
              )}
              {cur.payment === "pending" && cur.status !== "cancelled" && (
                <button className="btn sm" onClick={() => runAction(cur, "mark_paid")} disabled={!!pendingAction}>
                  <I.cc size={12} /> {pendingAction === "mark_paid" ? "…" : lang === "ko" ? "결제 완료 처리" : "Mark paid"}
                </button>
              )}
              {cur.payment === "pending" && cur.status !== "cancelled" && stripeEnabledPublic && (
                <button
                  className="btn sm"
                  onClick={async () => {
                    const r = await createBookingCheckoutSession(cur.id);
                    if (r.ok) window.location.href = r.url;
                    else setActionError(r.error);
                  }}
                  disabled={!!pendingAction}
                >
                  <I.zap size={12} /> {lang === "ko" ? "Stripe 결제" : "Pay with Stripe"}
                </button>
              )}
              {cur.payment === "paid" && cur.status !== "cancelled" && (
                <button className="btn sm ghost" onClick={() => runAction(cur, "mark_refunded")} disabled={!!pendingAction}>
                  <I.refresh size={12} /> {pendingAction === "mark_refunded" ? "…" : lang === "ko" ? "환불 처리" : "Refund"}
                </button>
              )}
              {cur.status !== "cancelled" && cur.status !== "checked_out" && (
                <button className="btn sm ghost" onClick={() => runAction(cur, "cancel")} disabled={!!pendingAction}>
                  <I.close size={12} /> {pendingAction === "cancel" ? "…" : lang === "ko" ? "취소" : "Cancel"}
                </button>
              )}
              {cur.threadId ? (
                <a className="btn sm ghost" href={`/messages?thread=${cur.threadId}`}>
                  <I.msg size={12} /> {lang === "ko" ? "메시지" : "Message"}
                </a>
              ) : (
                <button className="btn sm ghost" disabled title={lang === "ko" ? "스레드 없음" : "No thread"}>
                  <I.msg size={12} /> {lang === "ko" ? "메시지" : "Message"}
                </button>
              )}
              <button className="btn sm ghost icon"><I.more size={12} /></button>
            </div>
          </div>
          {actionError && (
            <div style={{ padding: "6px 24px", background: "var(--bad-soft)", color: "var(--bad)", fontSize: 12 }}>
              {actionError}
            </div>
          )}

          {cur.warnings.length > 0 && (
            <div style={{ padding: "8px 24px 0", display: "flex", flexDirection: "column", gap: 4 }}>
              {cur.warnings.map((w, i) => {
                const disabledForReason = w.action === "send_reminder" && !cur.threadId;
                return (
                  <div key={i} className={`warn-banner sev-${w.severity}`}>
                    <I.warn size={12} />
                    <span style={{ flex: 1 }}>{w.label}</span>
                    {w.action && w.actionLabel && (
                      <button
                        className="btn sm"
                        style={{ height: 22, fontSize: 11 }}
                        onClick={() => handleWarningAction(cur, w as { action: "mark_paid" | "mark_refunded" | "send_reminder"; kind: string })}
                        disabled={!!warningPendingKind || disabledForReason}
                        title={disabledForReason ? "스레드 없음" : undefined}
                      >
                        {warningPendingKind === w.kind ? "…" : warningSavedKind === w.kind ? "✓" : w.actionLabel}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="bd-hero">
            <div className="bd-guest">
              <div className="bd-avatar">{cur.guest.name.charAt(0)}</div>
              <div>
                <div className="bd-gname">
                  <a
                    href={`/guests/${cur.guest.id}`}
                    style={{ color: "inherit", textDecoration: "none" }}
                    title={lang === "ko" ? "게스트 프로필 보기" : "View guest profile"}
                  >
                    {cur.guest.name}
                  </a>{" "}
                  <span className="flag">{cur.guest.flag}</span>
                </div>
                <div className="text-muted" style={{ fontSize: 12 }}>
                  {[cur.guest.email, cur.guest.phone].filter(Boolean).join(" · ")}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  {cur.roomNumber && <span className="pill">{lang === "ko" ? "객실" : "Room"} {cur.roomNumber}</span>}
                  {cur.guest.country && <span className="pill">{cur.guest.country}</span>}
                  {cur.guest.lifetime.bookingsCount >= 2 && (
                    <span className="pill acc dot" title={lang === "ko" ? `처음 방문: ${cur.guest.lifetime.firstStayIso}` : `First stay: ${cur.guest.lifetime.firstStayIso}`}>
                      {lang === "ko" ? `재방문 ${cur.guest.lifetime.bookingsCount}회` : `${cur.guest.lifetime.bookingsCount} stays`}
                    </span>
                  )}
                  {cur.guest.lifetime.lifetimeRevenue > 0 && (
                    <span className="pill" title={lang === "ko" ? "누적 매출 (취소 제외)" : "Lifetime revenue (excl. cancelled)"}>
                      {lang === "ko" ? "누적" : "LTV"} ₩{(cur.guest.lifetime.lifetimeRevenue / 1000).toLocaleString()}K
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="bd-stay">
              <div className="stay-dates">
                <div>
                  <div className="lbl tracker">{lang === "ko" ? "체크인" : "Check-in"}</div>
                  <div className="day num">{ci.day}</div>
                  <div className="text-muted" style={{ fontSize: 11 }}>{ci.sub}</div>
                </div>
                <div className="arrow"><I.arrowR size={14} /></div>
                <div>
                  <div className="lbl tracker">{lang === "ko" ? "체크아웃" : "Check-out"}</div>
                  <div className="day num">{co.day}</div>
                  <div className="text-muted" style={{ fontSize: 11 }}>{co.sub}</div>
                </div>
                <div style={{ flex: 1 }} />
                <div>
                  <div className="lbl tracker">{lang === "ko" ? "박" : "Nights"}</div>
                  <div className="day num">{cur.nights}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bd-grid">
            <div className="bd-card">
              <div className="card-h">{lang === "ko" ? "객실 & 요금" : "Room & rate"}</div>
              <div className="bd-rate">
                <div className="rt-line">
                  <div>
                    <div className="rt-name">{cur.roomType.name}</div>
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      {lang === "ko" ? "조식 포함" : "Breakfast included"}
                    </div>
                  </div>
                  <div className="rt-prc num">₩{Math.round(cur.total / cur.nights).toLocaleString()}/박</div>
                </div>
                <div className="hr" />
                <div className="bd-bill">
                  <div><span>{lang === "ko" ? "소계" : "Subtotal"}</span><span className="num">₩{Math.round(cur.total * 0.91).toLocaleString()}</span></div>
                  <div><span>{lang === "ko" ? "부가세" : "Tax"}</span><span className="num">₩{Math.round(cur.total * 0.09).toLocaleString()}</span></div>
                  <div><span>{lang === "ko" ? "채널 수수료" : "Channel fee"} (15%)</span><span className="num text-muted">−₩{Math.round(cur.total * 0.15).toLocaleString()}</span></div>
                  <div className="hr" />
                  <div className="total"><span>{lang === "ko" ? "게스트 결제" : "Guest pays"}</span><span className="num">₩{cur.total.toLocaleString()}</span></div>
                  <div className="total" style={{ color: "var(--ok)" }}><span>{lang === "ko" ? "실수령" : "Net to you"}</span><span className="num">₩{Math.round(cur.total * 0.85).toLocaleString()}</span></div>
                </div>
              </div>
            </div>

            <div className="bd-card">
              <div className="card-h">{lang === "ko" ? "결제" : "Payment"}</div>
              <div className="pay-block">
                {cur.payment === "paid" && <div className="pay-status ok"><I.check size={14} /> {lang === "ko" ? "결제 완료" : "Paid in full"}</div>}
                {cur.payment === "pending" && <div className="pay-status" style={{ color: "var(--warn)" }}><I.warn size={14} /> {lang === "ko" ? "결제 대기" : "Awaiting payment"}</div>}
                {cur.payment === "failed" && <div className="pay-status" style={{ color: "var(--bad)" }}><I.warn size={14} /> {lang === "ko" ? "결제 실패" : "Payment failed"}</div>}
                {cur.payment === "refunded" && <div className="pay-status" style={{ color: "var(--t-2)" }}><I.refresh size={14} /> {lang === "ko" ? "환불됨" : "Refunded"}</div>}
                <div className="pay-meta text-muted" style={{ fontSize: 12 }}>
                  <I.cc size={12} /> {lang === "ko" ? "채널 결제" : `Charged via ${curCh.name}`}
                </div>
                <div className="pay-meta text-muted" style={{ fontSize: 12 }}>
                  <I.calCheck size={12} /> {lang === "ko" ? "수신" : "Received"} {formatTimestamp(cur.createdAt, lang)}
                </div>
              </div>
            </div>

            <div className="bd-card">
              <div className="card-h">{lang === "ko" ? "특별 요청" : "Special requests"}</div>
              {cur.requests.length === 0 ? (
                <div className="text-muted" style={{ fontSize: 12, padding: "4px 0" }}>
                  {lang === "ko" ? "요청 사항 없음" : "No special requests"}
                </div>
              ) : (
                <div className="req-list">
                  {cur.requests.map((r, i) => {
                    const IconKey = REQUEST_ICONS[r.type];
                    const IconCmp = I[IconKey];
                    return (
                      <div key={i} className="req">
                        <IconCmp size={12} /> {r.label}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bd-card">
              <div className="card-h">{lang === "ko" ? "메모" : "Notes"}</div>
              <textarea
                value={notesDraft[cur.id] ?? cur.notes ?? ""}
                onChange={(e) => setNotesDraft((prev) => ({ ...prev, [cur.id]: e.target.value }))}
                placeholder={lang === "ko" ? "내부 메모 (게스트에게 보이지 않음)" : "Internal notes (not shown to guest)"}
                rows={3}
                style={{
                  width: "100%",
                  border: "1px solid var(--bd-2)",
                  borderRadius: "var(--r-sm)",
                  padding: "8px 10px",
                  font: "inherit",
                  fontSize: 12,
                  color: "var(--t-1)",
                  background: "var(--bg)",
                  resize: "vertical",
                  minHeight: 64,
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6, alignItems: "center" }}>
                {notesSaved && <span style={{ fontSize: 11, color: "var(--ok)" }}>✓ {lang === "ko" ? "저장됨" : "Saved"}</span>}
                <button
                  className="btn sm primary"
                  onClick={() => saveNotes(cur.id, notesDraft[cur.id] ?? cur.notes ?? "")}
                  disabled={notesPending || (notesDraft[cur.id] ?? cur.notes ?? "") === (cur.notes ?? "")}
                >
                  {notesPending ? "…" : lang === "ko" ? "저장" : "Save"}
                </button>
              </div>
            </div>

            <div className="bd-card">
              <div className="card-h">{lang === "ko" ? "활동" : "Activity"}</div>
              <div className="act-list">
                {cur.events.length === 0 ? (
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    {lang === "ko" ? "활동 없음" : "No activity"}
                  </div>
                ) : (
                  cur.events.map((e: BookingTimelineEvent, i) => {
                    const src = parseEventSource(e.body);
                    return (
                      <div key={i} className="act">
                        <div className={`act-d ${e.type === "message_received" ? "hl" : ""}`} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <b>{lang === "ko" ? EVENT_LABELS[e.type].ko : EVENT_LABELS[e.type].en}</b>
                            {src && <span className={`src-pill src-${src.cls}`}>{src.label}</span>}
                          </div>
                          <div className="text-muted" style={{ fontSize: 11 }}>
                            {formatTimestamp(e.occurredAt, lang)}
                            {src ? (src.cleanedBody ? ` · ${src.cleanedBody}` : "") : (e.body ? ` · ${e.body}` : "")}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .bk-wrap { display: flex; flex-direction: column; height: 100%;}
        .bk-filters {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 24px;
          border-bottom: 1px solid var(--bd-1);
          background: var(--bg);
        }
        .bk-filters .seg-btn { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; height: 24px;}
        .search-bar { display: flex; align-items: center; gap: 6px; padding: 0 10px; height: 28px; background: var(--bg-mute); border: 1px solid var(--bd-1); border-radius: var(--r-sm); width: 280px; color: var(--t-3);}
        .search-bar input { flex: 1; border: 0; background: transparent; outline: none; font: inherit; font-size: var(--fs-sm);}
        .seg { display: inline-flex; gap: 2px; background: var(--bg-mute); border: 1px solid var(--bd-1); border-radius: var(--r-sm); padding: 2px;}
        .seg-btn { border: 0; background: transparent; padding: 4px 10px; height: 22px; font: inherit; font-size: var(--fs-xs); color: var(--t-2); border-radius: 4px; cursor: pointer; font-weight: 500;}
        .seg-btn.active { background: var(--bg); color: var(--t-1); box-shadow: var(--shadow-1);}

        .bk-advanced { padding: 10px 24px; border-bottom: 1px solid var(--bd-1); background: var(--bg-1); }
        .adv-row { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
        .adv-field { display: flex; flex-direction: column; gap: 4px; min-width: 140px; }
        .adv-field > span { font-size: 11px; color: var(--t-3); font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; }
        .adv-field .input { height: 28px; font-size: 12px; }

        .active-chips { display: flex; gap: 6px; align-items: center; padding: 8px 24px; border-bottom: 1px solid var(--bd-1); background: var(--bg-1); flex-wrap: wrap; }
        .active-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 999px; background: var(--acc-soft); color: var(--acc-text); border: 1px solid var(--acc-bd); font: inherit; font-size: 11px; font-weight: 500; cursor: pointer; }
        .active-chip:hover { background: var(--acc); color: white; border-color: var(--acc); }
        .active-chip.save-chip { background: var(--ok-soft); color: var(--ok); border-color: var(--ok); }
        .active-chip.save-chip:hover { background: var(--ok); color: white; border-color: var(--ok); }

        .bk-split { display: grid; grid-template-columns: 360px 1fr; flex: 1; min-height: 0;}
        .bk-list { border-right: 1px solid var(--bd-1); overflow: auto; background: var(--bg-1);}
        .bk-row {
          width: 100%; text-align: left; border: 0; background: transparent;
          padding: 12px 16px;
          border-bottom: 1px solid var(--bd-1);
          cursor: pointer; position: relative;
          font: inherit;
          display: flex; flex-direction: column; gap: 4px;
        }
        .bk-row:hover { background: var(--bg-hover);}
        .bk-row.active { background: var(--bg-elev); box-shadow: inset 3px 0 0 var(--acc);}
        .bk-row-top { display: flex; justify-content: space-between; align-items: center;}
        .bk-name { font-size: var(--fs-md); font-weight: 600; color: var(--t-1); display: inline-flex; align-items: center; gap: 6px;}
        .bk-total { font-size: var(--fs-md); color: var(--t-1); font-weight: 600;}
        .bk-row-mid { font-size: var(--fs-xs); color: var(--t-2); display: flex; align-items: center; gap: 5px;}
        .bk-row-bot { font-size: var(--fs-xs); color: var(--t-2); display: flex; align-items: center; gap: 6px; margin-top: 2px;}

        .bk-detail { overflow: auto; background: var(--bg);}
        .bd-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 24px; border-bottom: 1px solid var(--bd-1); background: var(--bg-1);}
        .bd-id { display: flex; align-items: center; gap: 10px;}
        .bd-num { font-size: 13px; color: var(--t-2); font-weight: 600;}
        .bd-hero { padding: 20px 24px; display: grid; grid-template-columns: 280px 1fr; gap: 20px; align-items: center; border-bottom: 1px solid var(--bd-1);}
        .bd-guest { display: flex; gap: 12px; align-items: center;}
        .bd-avatar { width: 48px; height: 48px; border-radius: 999px; background: linear-gradient(135deg, #fcd34d, #f59e0b); color: #78350f; font-weight: 700; font-size: 18px; display: flex; align-items: center; justify-content: center; flex: 0 0 48px;}
        .bd-gname { font-size: var(--fs-xl); font-weight: 600; color: var(--t-1);}
        .bd-stay { background: var(--bg-1); border: 1px solid var(--bd-1); border-radius: var(--r-md); padding: 14px 18px;}
        .stay-dates { display: flex; gap: 18px; align-items: center;}
        .stay-dates .lbl { color: var(--t-3); margin-bottom: 2px;}
        .stay-dates .day { font-size: 18px; font-weight: 600; color: var(--t-1); letter-spacing: -0.01em;}
        .stay-dates .arrow { color: var(--t-3);}

        .bd-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 12px; padding: 16px 24px;}
        .bd-card { background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: var(--r-md); padding: 14px 16px;}
        .card-h { font-size: var(--fs-md); font-weight: 600; margin-bottom: 10px; color: var(--t-1);}
        .rt-line { display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px;}
        .rt-line .rt-name { font-weight: 500; color: var(--t-1);}
        .rt-line .rt-prc { font-weight: 600; color: var(--t-1);}
        .bd-bill { display: flex; flex-direction: column; gap: 6px; padding-top: 10px; font-size: var(--fs-sm);}
        .bd-bill > div { display: flex; justify-content: space-between; color: var(--t-2);}
        .bd-bill .total { font-weight: 600; color: var(--t-1); font-size: var(--fs-md);}

        .pay-block { display: flex; flex-direction: column; gap: 8px;}
        .pay-status { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--ok); font-size: var(--fs-md);}
        .pay-meta { display: flex; align-items: center; gap: 6px;}

        .req-list { display: flex; flex-direction: column; gap: 8px; font-size: var(--fs-sm);}
        .req { display: flex; align-items: center; gap: 8px; color: var(--t-2);}

        .act-list { display: flex; flex-direction: column; gap: 10px;}
        .src-pill { font-size: 10px; padding: 1px 6px; border-radius: 4px; font-weight: 500; }
        .src-pill.src-hostaway { background: #e0e7ff; color: #4338ca; }
        .src-pill.src-auto { background: #ecfdf5; color: #15803d; }
        .src-pill.src-ical { background: #f0f9ff; color: #075985; }
        .src-pill.src-stripe { background: #fef3c7; color: #a16207; }
        .src-pill.src-ota { background: #fef2f2; color: #b91c1c; }
        .warn-banner { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: var(--r-sm); font-size: 12px; font-weight: 500; }
        .warn-banner.sev-bad { background: var(--bad-soft); color: var(--bad); border: 1px solid var(--bad); }
        .warn-banner.sev-warn { background: var(--warn-soft); color: var(--warn); border: 1px solid #fcd34d; }
        .warn-banner.sev-info { background: var(--info-soft); color: var(--info); border: 1px solid #93c5fd; }
        .act { display: flex; gap: 10px; font-size: var(--fs-sm);}
        .act-d { width: 8px; height: 8px; border-radius: 999px; background: var(--bd-3); margin-top: 5px; flex: 0 0 8px;}
        .act-d.hl { background: var(--acc);}
        .mini-ch { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-xs); color: var(--t-2); font-weight: 500;}
        .mini-ch .dot { width: 7px; height: 7px; border-radius: 2px; flex: 0 0 7px;}
      `}</style>
    </div>
  );
};

function buildPageHref(targetPage: number): string {
  if (typeof window === "undefined") return `/bookings?page=${targetPage}`;
  const url = new URL(window.location.href);
  if (targetPage <= 0) url.searchParams.delete("page");
  else url.searchParams.set("page", String(targetPage));
  return url.pathname + (url.search || "");
}

function PaginationFooter({ pagination, lang }: { pagination: BookingsPaginationState; lang: Lang }) {
  const { page, pageSize, total, hasMore } = pagination;
  const start = page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);
  const lastPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  return (
    <div className="pg-foot">
      <div className="pg-info text-muted">
        {lang === "ko"
          ? `${start.toLocaleString()}–${end.toLocaleString()} / ${total.toLocaleString()}건`
          : `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()}`}
      </div>
      <div className="pg-nav">
        <a
          className={`btn xs ghost ${page === 0 ? "disabled" : ""}`}
          href={page > 0 ? buildPageHref(page - 1) : undefined}
          aria-disabled={page === 0}
          onClick={(e) => { if (page === 0) e.preventDefault(); }}
        >
          ← {lang === "ko" ? "이전" : "Prev"}
        </a>
        <span className="pg-num">
          {page + 1} / {lastPage + 1}
        </span>
        <a
          className={`btn xs ghost ${!hasMore ? "disabled" : ""}`}
          href={hasMore ? buildPageHref(page + 1) : undefined}
          aria-disabled={!hasMore}
          onClick={(e) => { if (!hasMore) e.preventDefault(); }}
        >
          {lang === "ko" ? "다음" : "Next"} →
        </a>
      </div>
      <style>{`
        .pg-foot { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-top: 1px solid var(--bd-1); background: var(--bg-elev); }
        .pg-info { font-size: 11px; }
        .pg-nav { display: flex; align-items: center; gap: 8px; }
        .pg-nav .btn.xs { height: 24px; padding: 0 10px; font-size: 11px; text-decoration: none; display: inline-flex; align-items: center; }
        .pg-nav .btn.disabled { opacity: 0.4; cursor: not-allowed; pointer-events: none; }
        .pg-num { font-size: 11px; color: var(--t-2); font-variant-numeric: tabular-nums; min-width: 50px; text-align: center; }
      `}</style>
    </div>
  );
}

function ConflictBanner({
  lang,
  conflicts,
  onOpen,
  onResolve,
}: {
  lang: Lang;
  conflicts: RoomConflictRow[];
  onOpen: () => void;
  onResolve: (c: RoomConflictRow) => void;
}) {
  return (
    <div className="conflict-banner">
      <div className="cb-icon"><I.warn size={14} /></div>
      <div className="cb-body">
        <div className="cb-title">
          {lang === "ko"
            ? `객실 충돌 ${conflicts.length}건 — 같은 방에 두 예약이 겹칩니다`
            : `${conflicts.length} room conflict${conflicts.length === 1 ? "" : "s"} — overlapping bookings on the same room`}
        </div>
        <div className="cb-list">
          {conflicts.slice(0, 3).map((c) => (
            <button key={c.bookingId} className="cb-chip" onClick={() => onResolve(c)}>
              {c.guestName} ↔ {c.withGuestName} · {lang === "ko" ? "객실" : "Room"} {c.roomNumber ?? "—"}
            </button>
          ))}
          {conflicts.length > 3 && (
            <button className="cb-chip more" onClick={onOpen}>
              +{conflicts.length - 3} {lang === "ko" ? "더" : "more"}
            </button>
          )}
        </div>
      </div>
      <style>{`
        .conflict-banner { margin: 0 24px 8px; padding: 10px 14px; background: var(--bad-soft); border: 1px solid var(--bad); border-radius: 8px; display: flex; gap: 10px; align-items: flex-start; }
        .cb-icon { color: var(--bad); padding-top: 2px; }
        .cb-title { font-weight: 600; color: var(--bad); font-size: 13px; }
        .cb-list { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
        .cb-chip { padding: 3px 10px; background: var(--bg-elev); color: var(--bad); border: 1px solid var(--bad); border-radius: 999px; font: inherit; font-size: 11px; font-weight: 500; cursor: pointer; }
        .cb-chip:hover { background: var(--bad); color: white; }
        .cb-chip.more { background: transparent; opacity: 0.7; }
      `}</style>
    </div>
  );
}

function ConflictModal({
  lang,
  conflict,
  onClose,
  onResolved,
}: {
  lang: Lang;
  conflict: RoomConflictRow;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSwap = (roomId: string) => {
    setError(null);
    startTransition(async () => {
      const r = await assignBookingRoom(conflict.bookingId, roomId);
      if ("ok" in r && r.ok) onResolved();
      else if ("error" in r) setError(r.error);
    });
  };
  const onUnassign = () => {
    if (!confirm(lang === "ko" ? "객실 배정을 해제하시겠습니까? 새 객실은 나중에 지정해야 합니다." : "Unassign this room? You'll need to pick a new one later.")) return;
    setError(null);
    startTransition(async () => {
      const r = await assignBookingRoom(conflict.bookingId, null);
      if ("ok" in r && r.ok) onResolved();
      else if ("error" in r) setError(r.error);
    });
  };

  return (
    <div className="cf-overlay" onClick={onClose}>
      <div className="cf-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cf-head">
          <div>
            <div className="cf-title">
              <I.warn size={14} style={{ color: "var(--bad)" }} /> {lang === "ko" ? "객실 충돌 해결" : "Resolve room conflict"}
            </div>
            <div className="cf-sub">
              {lang === "ko"
                ? `${conflict.guestName} (${conflict.bookingRef ?? "—"}) ↔ ${conflict.withGuestName} (${conflict.withBookingRef ?? "—"})`
                : `${conflict.guestName} (${conflict.bookingRef ?? "—"}) ↔ ${conflict.withGuestName} (${conflict.withBookingRef ?? "—"})`}
            </div>
            <div className="cf-sub text-muted">
              {conflict.roomTypeName} · {lang === "ko" ? "객실" : "Room"} {conflict.roomNumber ?? "—"} · {conflict.checkIn} → {conflict.checkOut}
            </div>
          </div>
          <button className="btn icon ghost" onClick={onClose}><I.close size={14} /></button>
        </div>
        {error && <div className="cf-err"><I.warn size={11} /> {error}</div>}
        <div className="cf-body">
          <div className="cf-section-label">
            {lang === "ko" ? "사용 가능한 다른 객실" : "Available alternatives"}
            <span className="text-muted" style={{ fontSize: 11, marginLeft: 6 }}>
              ({conflict.alternatives.length})
            </span>
          </div>
          {conflict.alternatives.length === 0 ? (
            <div className="cf-empty">
              {lang === "ko"
                ? "같은 객실 타입에 사용 가능한 방이 없습니다. 한쪽 예약을 취소하거나 객실 배정을 해제하세요."
                : "No available rooms of the same type. Cancel one booking or unassign the room."}
            </div>
          ) : (
            <ul className="cf-alt-list">
              {conflict.alternatives.map((a) => (
                <li key={a.roomId}>
                  <span className="cf-alt-num">{lang === "ko" ? "객실" : "Room"} {a.number}</span>
                  <button className="btn sm primary" onClick={() => onSwap(a.roomId)} disabled={pending}>
                    {lang === "ko" ? "이 객실로 이동" : "Move here"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="cf-foot">
          <button className="btn sm ghost" onClick={onUnassign} disabled={pending}>
            {lang === "ko" ? "객실 배정 해제" : "Unassign room"}
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn sm ghost" onClick={onClose}>
            {lang === "ko" ? "닫기" : "Close"}
          </button>
        </div>
        <style>{`
          .cf-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.32); z-index: 80; display: flex; align-items: center; justify-content: center; }
          .cf-modal { width: min(540px, 92vw); background: var(--bg); border: 1px solid var(--bd-1); border-radius: 10px; box-shadow: var(--shadow-pop, 0 10px 40px rgba(0,0,0,.3)); display: flex; flex-direction: column; max-height: 80vh; }
          .cf-head { display: flex; justify-content: space-between; align-items: flex-start; padding: 14px 16px; border-bottom: 1px solid var(--bd-1); gap: 12px; }
          .cf-title { font-weight: 600; color: var(--t-1); font-size: 14px; display: inline-flex; align-items: center; gap: 6px; }
          .cf-sub { font-size: 12px; color: var(--t-2); margin-top: 2px; }
          .cf-err { margin: 8px 16px 0; padding: 6px 10px; border-radius: 6px; font-size: 11px; background: var(--bad-soft); color: var(--bad); display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; }
          .cf-body { padding: 14px 16px; flex: 1; overflow-y: auto; }
          .cf-section-label { font-size: 11px; font-weight: 600; color: var(--t-3); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px; }
          .cf-empty { padding: 16px; background: var(--bg-mute); border-radius: 6px; color: var(--t-3); font-size: 12px; text-align: center; }
          .cf-alt-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
          .cf-alt-list li { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: 6px; }
          .cf-alt-num { font-weight: 500; color: var(--t-1); font-size: 12px; }
          .cf-foot { display: flex; align-items: center; padding: 12px 16px; border-top: 1px solid var(--bd-1); gap: 8px; }
        `}</style>
      </div>
    </div>
  );
}
