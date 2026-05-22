"use client";

import { Fragment, useCallback, useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { I } from "../icons";
import { STR, channelById, type ChannelId, type Lang } from "@/lib/i18n";
import type { CalendarBookingSpan, CalendarGrid } from "@/lib/queries";
import { applyBulkEdit } from "@/lib/actions";
import type { ChannelType } from "@prisma/client";
import { CalendarBookingDetail } from "./CalendarBookingDetail";

type ViewMode = "all" | "inventory" | "rates" | "restrictions";

interface BulkOptimisticPatch {
  rt: string;
  startIdx: number;
  endIdx: number;
  rate?: number;
  inventory?: number;
  channels?: ChannelId[];
}

function applyBulkPatchToGrid(state: CalendarGrid, patch: BulkOptimisticPatch): CalendarGrid {
  return {
    ...state,
    rows: state.rows.map((row) => {
      if (row.roomTypeId !== patch.rt) return row;
      return {
        ...row,
        cells: row.cells.map((cell, i) => {
          if (i < patch.startIdx || i > patch.endIdx) return cell;
          let nextRates = cell.rates;
          if (patch.rate !== undefined && patch.channels && patch.channels.length > 0) {
            nextRates = { ...cell.rates };
            for (const ch of patch.channels) nextRates[ch] = patch.rate;
          }
          const nextAvailable = patch.inventory !== undefined ? patch.inventory : cell.available;
          return {
            ...cell,
            available: nextAvailable,
            // Inventory edits resolve overbookings if available > 0
            over: nextAvailable < 0,
            rates: nextRates,
          };
        }),
      };
    }),
  };
}

interface Selection {
  rt: string;
  start: number;
  end: number;
  dragging: boolean;
}

interface CalendarProps {
  lang?: Lang;
  grid: CalendarGrid;
}

export const Calendar = ({ lang = "ko", grid }: CalendarProps) => {
  const t = STR[lang];
  const dayLabels = lang === "ko" ? ["일", "월", "화", "수", "목", "금", "토"] : ["S", "M", "T", "W", "T", "F", "S"];
  const days = grid.days.length;

  const router = useRouter();
  const searchParams = useSearchParams();
  const currentRange = parseInt(searchParams?.get("range") ?? `${grid.days.length}`, 10);
  const currentStart = grid.days[0]?.iso ?? "";
  const buildUrl = useCallback(
    (overrides: { range?: number | null; start?: string | null }) => {
      const params = new URLSearchParams();
      const range = overrides.range !== undefined ? overrides.range : currentRange;
      const start = overrides.start !== undefined ? overrides.start : searchParams?.get("start") ?? null;
      if (range && range !== 14) params.set("range", String(range));
      if (start) params.set("start", start);
      const qs = params.toString();
      return qs ? `/calendar?${qs}` : "/calendar";
    },
    [currentRange, searchParams],
  );
  const setRange = (n: number) => {
    if (n === currentRange) return;
    router.push(buildUrl({ range: n }));
  };
  const shiftRange = useCallback(
    (direction: -1 | 1) => {
      const startDate = new Date(`${currentStart}T00:00:00.000Z`);
      if (Number.isNaN(startDate.getTime())) return;
      startDate.setUTCDate(startDate.getUTCDate() + direction * currentRange);
      router.push(buildUrl({ start: startDate.toISOString().slice(0, 10) }));
    },
    [currentStart, currentRange, buildUrl, router],
  );
  const goToday = useCallback(() => {
    router.push(buildUrl({ start: null }));
  }, [buildUrl, router]);

  const exportCsv = () => {
    const headers = ["RoomType", "Date", "DayOfWeek", "Available", "Capacity", "Closed", "MinStay", ...optimisticGrid.channels];
    const escape = (v: unknown) => {
      const s = (v ?? "").toString();
      return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    const dayLabelsCsv = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (const row of optimisticGrid.rows) {
      row.cells.forEach((cell, i) => {
        const day = optimisticGrid.days[i];
        const channelRates = optimisticGrid.channels.map((ch) => cell.rates[ch] ?? "");
        lines.push([
          row.name,
          day.iso,
          dayLabelsCsv[day.dow],
          cell.available,
          cell.capacity,
          cell.closed ? "true" : "false",
          cell.minStay,
          ...channelRates,
        ].map(escape).join(","));
      });
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const startIso = optimisticGrid.days[0]?.iso ?? "today";
    a.href = url;
    a.download = `calendar-${startIso}-${optimisticGrid.days.length}d.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const [optimisticGrid, addBulkPatch] = useOptimistic(grid, applyBulkPatchToGrid);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [openSpan, setOpenSpan] = useState<CalendarBookingSpan | null>(null);
  const [inlineEdit, setInlineEdit] = useState<{ rt: string; day: number; channel: ChannelId; value: string } | null>(null);
  const [inlinePending, startInlineTransition] = useTransition();
  const [inlineError, setInlineError] = useState<string | null>(null);

  const openInlineEdit = (rt: string, day: number, channel: ChannelId, currentRate: number | undefined) => {
    setInlineError(null);
    setInlineEdit({
      rt,
      day,
      channel,
      value: currentRate ? String(currentRate) : "",
    });
  };
  const commitInlineEdit = () => {
    if (!inlineEdit) return;
    const num = parseInt(inlineEdit.value, 10);
    if (!Number.isFinite(num) || num < 0) {
      setInlineError(lang === "ko" ? "유효한 가격을 입력하세요" : "Enter a valid price");
      return;
    }
    const date = optimisticGrid.days[inlineEdit.day]?.iso;
    if (!date) return;
    startInlineTransition(async () => {
      // Optimistic patch first so the UI snaps before network round-trip
      addBulkPatch({
        rt: inlineEdit.rt,
        startIdx: inlineEdit.day,
        endIdx: inlineEdit.day,
        rate: num,
        channels: [inlineEdit.channel],
      });
      const r = await applyBulkEdit({
        roomTypeId: inlineEdit.rt,
        startDate: date,
        endDate: date,
        rate: num,
        channels: [inlineEdit.channel] as unknown as Parameters<typeof applyBulkEdit>[0]["channels"],
      });
      if ("ok" in r && r.ok) {
        setInlineEdit(null);
        router.refresh();
      } else if ("error" in r) {
        setInlineError(r.error);
      }
    });
  };
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [hiddenChannels, setHiddenChannels] = useState<Set<ChannelId>>(new Set());
  const toggleChannel = (c: ChannelId) =>
    setHiddenChannels((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  const visibleChannels = optimisticGrid.channels.filter((c) => !hiddenChannels.has(c));
  const showInventoryRow = viewMode === "all" || viewMode === "inventory";
  const showRateRows = viewMode === "all" || viewMode === "rates";
  const showRestrictionsRows = viewMode === "restrictions";
  const [bulkRate, setBulkRate] = useState("");
  const [bulkInventory, setBulkInventory] = useState("");
  const [bulkMinStay, setBulkMinStay] = useState("");
  const [bulkChannels, setBulkChannels] = useState<ChannelId[]>(grid.channels);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkOk, setBulkOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleBulkChannel = (c: ChannelId) =>
    setBulkChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const submitBulk = () => {
    if (!selection) return;
    setBulkError(null);
    setBulkOk(null);

    const rate = bulkRate.trim() === "" ? undefined : parseInt(bulkRate.replace(/,/g, ""), 10);
    const inventory = bulkInventory.trim() === "" ? undefined : parseInt(bulkInventory, 10);
    const minStay = bulkMinStay.trim() === "" ? undefined : parseInt(bulkMinStay, 10);

    if (rate === undefined && inventory === undefined && minStay === undefined) {
      setBulkError(lang === "ko" ? "적어도 하나의 필드를 입력하세요." : "Enter at least one field");
      return;
    }
    if (rate !== undefined && Number.isNaN(rate)) {
      setBulkError(lang === "ko" ? "가격이 유효하지 않습니다." : "Invalid rate");
      return;
    }
    if (rate !== undefined && bulkChannels.length === 0) {
      setBulkError(lang === "ko" ? "가격 변경 시 채널을 1개 이상 선택하세요." : "Pick at least one channel for rate change");
      return;
    }

    const lo = Math.min(selection.start, selection.end);
    const hi = Math.max(selection.start, selection.end);
    const startDate = grid.days[lo].iso;
    const endDate = grid.days[hi].iso;
    const channelsForRate = rate !== undefined ? bulkChannels : undefined;

    startTransition(async () => {
      addBulkPatch({
        rt: selection.rt,
        startIdx: lo,
        endIdx: hi,
        rate,
        inventory,
        channels: channelsForRate,
      });
      const result = await applyBulkEdit({
        roomTypeId: selection.rt,
        startDate,
        endDate,
        rate,
        inventory,
        minStay,
        channels: channelsForRate as unknown as ChannelType[] | undefined,
      });
      if (!result.ok) {
        setBulkError(result.error);
        return; // useOptimistic auto-reverts since router.refresh isn't called
      }
      setBulkOk(
        lang === "ko"
          ? `적용됨: ${result.daysAffected}일 · 가격 ${result.ratesUpdated}건 · 재고 ${result.inventoryUpdated}건${result.channelsSkipped.length > 0 ? ` · 미매핑 채널 건너뜀: ${result.channelsSkipped.join(", ")}` : ""}`
          : `Applied: ${result.daysAffected}d · ${result.ratesUpdated} rates · ${result.inventoryUpdated} inventory${result.channelsSkipped.length > 0 ? ` · skipped (no mapping): ${result.channelsSkipped.join(", ")}` : ""}`,
      );
      router.refresh();
      setTimeout(() => closeBulk(), 800);
    });
  };

  const onCellMouseDown = (rt: string, day: number) =>
    setSelection({ rt, start: day, end: day, dragging: true });

  const onCellMouseEnter = (rt: string, day: number) =>
    setSelection((s) => (s && s.dragging && s.rt === rt ? { ...s, end: day } : s));

  useEffect(() => {
    const up = () => {
      setSelection((s) => {
        if (!s) return null;
        if (!s.dragging) return s;
        setBulkOpen(true);
        return {
          ...s,
          dragging: false,
          start: Math.min(s.start, s.end),
          end: Math.max(s.start, s.end),
        };
      });
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // Keyboard shortcuts (T = today, [ / ] = nav, Esc = close popover/modal)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when user is typing in an input/textarea/select
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (target?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Escape") {
        if (bulkOpen) {
          setBulkOpen(false);
          setSelection(null);
          e.preventDefault();
          return;
        }
        if (openSpan) {
          setOpenSpan(null);
          e.preventDefault();
          return;
        }
        if (selection) {
          setSelection(null);
          e.preventDefault();
          return;
        }
      }
      if (e.key === "t" || e.key === "T") {
        goToday();
        e.preventDefault();
        return;
      }
      if (e.key === "[") {
        shiftRange(-1);
        e.preventDefault();
        return;
      }
      if (e.key === "]") {
        shiftRange(1);
        e.preventDefault();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bulkOpen, openSpan, selection, goToday, shiftRange]);

  const isSelected = (rt: string, day: number) => {
    if (!selection || selection.rt !== rt) return false;
    const lo = Math.min(selection.start, selection.end);
    const hi = Math.max(selection.start, selection.end);
    return day >= lo && day <= hi;
  };

  const closeBulk = () => {
    setBulkOpen(false);
    setSelection(null);
    setBulkRate("");
    setBulkInventory("");
    setBulkMinStay("");
    setBulkError(null);
    setBulkOk(null);
  };

  const monthLabel = grid.days[0]
    ? lang === "ko"
      ? `${parseInt(grid.days[0].iso.slice(0, 4))}년 ${parseInt(grid.days[0].iso.slice(5, 7))}월`
      : new Date(`${grid.days[0].iso}T00:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    : "";

  return (
    <div className="cal-page">
      <div className="cal-tools">
        <div className="left">
          <button className="btn ghost icon" onClick={() => shiftRange(-1)} aria-label={lang === "ko" ? "이전" : "Previous"} title={lang === "ko" ? "단축키 [" : "Shortcut ["}>
            <I.chevL size={14} />
          </button>
          <button className="btn ghost" onClick={goToday}>{monthLabel} <I.chevD size={12} /></button>
          <button className="btn ghost icon" onClick={() => shiftRange(1)} aria-label={lang === "ko" ? "다음" : "Next"} title={lang === "ko" ? "단축키 ]" : "Shortcut ]"}>
            <I.chevR size={14} />
          </button>
          <div className="seg">
            {[7, 14, 30, 90].map((n) => (
              <button
                key={n}
                className={`seg-btn ${currentRange === n ? "active" : ""}`}
                onClick={() => setRange(n)}
              >
                {n}d
              </button>
            ))}
          </div>
          <button className="btn sm ghost" onClick={goToday} title={lang === "ko" ? "단축키 T" : "Shortcut T"}>
            <I.cal size={12} /> {t.today} <span className="kbd-hint">T</span>
          </button>
        </div>
        <div className="right">
          <div className="legend">
            <span><i className="lg-d lg-booked" />{lang === "ko" ? "예약" : "Booked"}</span>
            <span><i className="lg-d lg-blocked" />{lang === "ko" ? "차단" : "Blocked"}</span>
            <span><i className="lg-d lg-held" />{lang === "ko" ? "홀드" : "Hold"}</span>
            <span><i className="lg-d lg-over" />{lang === "ko" ? "오버부킹" : "Overbook"}</span>
          </div>
          <div className="seg" style={{ marginLeft: 0 }} title={lang === "ko" ? "뷰 모드" : "View mode"}>
            <button className={`seg-btn ${viewMode === "all" ? "active" : ""}`} onClick={() => setViewMode("all")}>
              <I.eye size={11} /> {lang === "ko" ? "전체" : "All"}
            </button>
            <button className={`seg-btn ${viewMode === "inventory" ? "active" : ""}`} onClick={() => setViewMode("inventory")}>
              {lang === "ko" ? "재고" : "Inv"}
            </button>
            <button className={`seg-btn ${viewMode === "rates" ? "active" : ""}`} onClick={() => setViewMode("rates")}>
              {lang === "ko" ? "가격" : "Rates"}
            </button>
            <button className={`seg-btn ${viewMode === "restrictions" ? "active" : ""}`} onClick={() => setViewMode("restrictions")}>
              {lang === "ko" ? "제한" : "Rules"}
            </button>
          </div>
          <div className="ch-filter">
            {optimisticGrid.channels.map((c) => {
              const ch = channelById(c)!;
              const hidden = hiddenChannels.has(c);
              return (
                <button
                  key={c}
                  className={`ch-toggle ${hidden ? "off" : ""}`}
                  onClick={() => toggleChannel(c)}
                  title={ch.name}
                >
                  <span className={`dot ${ch.cls}`} style={{ opacity: hidden ? 0.3 : 1 }} />
                </button>
              );
            })}
          </div>
          <button
            className="btn sm ghost"
            onClick={exportCsv}
            title={lang === "ko" ? `${optimisticGrid.rows.length * optimisticGrid.days.length}개 셀 CSV` : `Export ${optimisticGrid.rows.length * optimisticGrid.days.length} cells`}
          >
            <I.download size={12} /> {lang === "ko" ? "내보내기" : "Export"}
          </button>
          <button className="btn sm primary"><I.edit size={12} /> {t.bulk}</button>
        </div>
      </div>

      <div className="cal-wrap">
        <div className="cal-grid">
          <div className="cal-corner">
            <span className="tracker">{lang === "ko" ? "객실 타입" : "Room Type"}</span>
          </div>

          <div className="cal-head-row">
            {optimisticGrid.days.map((d, i) => (
              <div key={i} className={`cal-head ${d.weekend ? "wknd" : ""} ${d.today ? "today" : ""}`}>
                <div className="dow">{dayLabels[d.dow]}</div>
                <div className="dom num">{d.dom}</div>
              </div>
            ))}
          </div>

          {optimisticGrid.rows.map((rt) => (
            <Fragment key={rt.roomTypeId}>
              <div className="cal-rt">
                <button className="rt-toggle"><I.chevD size={11} /></button>
                <div className="rt-meta">
                  <div className="rt-name">{rt.name}</div>
                  <div className="rt-sub text-muted">{rt.count} {t.rooms}</div>
                </div>
              </div>

              {showInventoryRow && <div className="cal-row inv">
                {rt.cells.map((cell, i) => {
                  const d = optimisticGrid.days[i];
                  return (
                    <div
                      key={i}
                      className={`cal-cell inv ${d.weekend ? "wknd" : ""} ${d.today ? "today" : ""} ${cell.over ? "over" : ""} ${cell.closed ? "blocked" : ""} ${isSelected(rt.roomTypeId, i) ? "sel" : ""}`}
                      onMouseDown={() => onCellMouseDown(rt.roomTypeId, i)}
                      onMouseEnter={() => onCellMouseEnter(rt.roomTypeId, i)}
                      title={cell.closed ? (lang === "ko" ? "마감" : "Closed") : undefined}
                    >
                      <div className="cell-bar">
                        <div className="bar-bg">
                          <div
                            className="bar-fill"
                            style={{ width: `${Math.min((cell.capacity - cell.available) / Math.max(1, cell.capacity), 1) * 100}%` }}
                          />
                        </div>
                      </div>
                      <div className="cell-num num">
                        {cell.over ? <span className="over-txt">!</span> : cell.closed ? "🚫" : cell.available}
                      </div>
                    </div>
                  );
                })}
              </div>}

              {showRestrictionsRows && (
                <>
                  <div className="cal-rt sub-row">
                    <span className="sub-spacer" />
                    <span className="text-muted" style={{ fontSize: 11 }}>{lang === "ko" ? "최소 박수" : "Min stay"}</span>
                  </div>
                  <div className="cal-row rate">
                    {rt.cells.map((cell, i) => {
                      const d = optimisticGrid.days[i];
                      return (
                        <div
                          key={i}
                          className={`cal-cell rate-cell ${d.weekend ? "wknd" : ""} ${d.today ? "today" : ""} ${isSelected(rt.roomTypeId, i) ? "sel" : ""}`}
                          onMouseDown={() => onCellMouseDown(rt.roomTypeId, i)}
                          onMouseEnter={() => onCellMouseEnter(rt.roomTypeId, i)}
                        >
                          <div className="rate-val num">{cell.minStay}{lang === "ko" ? "박" : "n"}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="cal-rt sub-row">
                    <span className="sub-spacer" />
                    <span className="text-muted" style={{ fontSize: 11 }}>{lang === "ko" ? "마감" : "Closed"}</span>
                  </div>
                  <div className="cal-row rate">
                    {rt.cells.map((cell, i) => {
                      const d = optimisticGrid.days[i];
                      return (
                        <div
                          key={i}
                          className={`cal-cell rate-cell ${d.weekend ? "wknd" : ""} ${d.today ? "today" : ""} ${cell.closed ? "blocked" : ""} ${isSelected(rt.roomTypeId, i) ? "sel" : ""}`}
                          onMouseDown={() => onCellMouseDown(rt.roomTypeId, i)}
                          onMouseEnter={() => onCellMouseEnter(rt.roomTypeId, i)}
                          style={{ textAlign: "center" }}
                        >
                          {cell.closed ? <span style={{ fontSize: 11, color: "var(--bad)" }}>🚫</span> : <span className="text-muted" style={{ fontSize: 11 }}>—</span>}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {showRateRows && visibleChannels.map((chId) => {
                const c = channelById(chId)!;
                return (
                  <Fragment key={chId}>
                    <div className="cal-rt sub-row">
                      <span className="sub-spacer" />
                      <span className="mini-ch">
                        <span className={`dot ${c.cls}`} />
                        {c.name}
                      </span>
                    </div>
                    <div className="cal-row rate">
                      {rt.cells.map((cell, i) => {
                        const d = optimisticGrid.days[i];
                        const v = cell.rates[chId];
                        const isEditing = inlineEdit?.rt === rt.roomTypeId && inlineEdit.day === i && inlineEdit.channel === chId;
                        return (
                          <div
                            key={i}
                            className={`cal-cell rate-cell ${d.weekend ? "wknd" : ""} ${d.today ? "today" : ""} ${isSelected(rt.roomTypeId, i) ? "sel" : ""} ${isEditing ? "editing" : ""}`}
                            onMouseDown={() => !isEditing && onCellMouseDown(rt.roomTypeId, i)}
                            onMouseEnter={() => !isEditing && onCellMouseEnter(rt.roomTypeId, i)}
                          >
                            {isEditing ? (
                              <input
                                type="number"
                                className="inline-rate-in num"
                                autoFocus
                                value={inlineEdit.value}
                                onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                                onBlur={() => { if (!inlinePending) setInlineEdit(null); }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") { e.preventDefault(); commitInlineEdit(); }
                                  if (e.key === "Escape") { e.preventDefault(); setInlineEdit(null); setInlineError(null); }
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                disabled={inlinePending}
                              />
                            ) : (
                              <>
                                <div className="rate-val num">{v ? `${Math.round(v / 1000)}K` : "—"}</div>
                                <button
                                  type="button"
                                  className="inline-edit-btn"
                                  title={lang === "ko" ? "이 셀만 수정" : "Edit just this cell"}
                                  onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                  onClick={(e) => { e.stopPropagation(); openInlineEdit(rt.roomTypeId, i, chId, v); }}
                                >
                                  <I.edit size={9} />
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Fragment>
                );
              })}

              <div className="cal-rt sub-row">
                <span className="sub-spacer" />
                <span className="text-muted" style={{ fontSize: 11, paddingLeft: 18 }}>
                  {lang === "ko" ? "예약" : "Bookings"}
                </span>
              </div>
              <div className="cal-row span-row">
                {optimisticGrid.days.map((d, i) => (
                  <div key={i} className={`cal-cell bg ${d.weekend ? "wknd" : ""} ${d.today ? "today" : ""}`} />
                ))}
                <div className="span-overlay">
                  {rt.bookings.map((b, i) => {
                    const w = b.end - b.start + 1;
                    const c = channelById(b.channel)!;
                    const nights = Math.max(1, Math.round((new Date(b.checkOut).getTime() - new Date(b.checkIn).getTime()) / 86_400_000));
                    const tooltipText = [
                      `${b.guestFlag} ${b.name}`,
                      `${c.name}${b.externalRef ? ` · ${b.externalRef}` : ""}`,
                      `${b.checkIn} → ${b.checkOut} (${nights}${lang === "ko" ? "박" : "n"})`,
                      `${b.roomTypeName} · ₩${b.total.toLocaleString()}`,
                      `${lang === "ko" ? "상태" : "Status"}: ${b.status} / ${b.payment}`,
                    ].join("\n");
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`booking-span ch-${b.channel}`}
                        style={{
                          left: `calc(${b.start} * (100% / ${days}) + 2px)`,
                          width: `calc(${w} * (100% / ${days}) - 4px)`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenSpan(b);
                        }}
                        title={tooltipText}
                      >
                        <span className={`dot ${c.cls}`} />
                        <span className="nm">{b.name}</span>
                      </button>
                    );
                  })}
                  {rt.cells.map((cell, i) =>
                    cell.over ? (
                      <div
                        key={`over-${i}`}
                        className="overbook-flag"
                        style={{
                          left: `calc(${i} * (100% / ${days}) + 2px)`,
                          width: `calc(1 * (100% / ${days}) - 4px)`,
                        }}
                      >
                        <I.warn size={10} /> {lang === "ko" ? "오버부킹" : "Overbook"}
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            </Fragment>
          ))}
        </div>
      </div>

      <CalendarBookingDetail lang={lang} span={openSpan} onClose={() => setOpenSpan(null)} />

      {inlineError && (
        <div className="inline-err" role="alert">
          <I.warn size={11} /> {inlineError}
          <button className="btn xs ghost" onClick={() => setInlineError(null)}>
            <I.close size={10} />
          </button>
        </div>
      )}

      {bulkOpen && selection && !selection.dragging && (
        <div className="bulk-pop">
          <div className="bulk-head">
            <div>
              <div className="title" style={{ fontSize: 14, fontWeight: 600 }}>{t.bulk}</div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                {optimisticGrid.rows.find((r) => r.roomTypeId === selection.rt)?.name} ·{" "}
                {Math.abs(selection.end - selection.start) + 1}
                {lang === "ko" ? "일" : "d"}
              </div>
            </div>
            <button className="btn ghost icon" onClick={closeBulk}><I.close size={14} /></button>
          </div>

          <div className="bulk-body">
            <div className="bulk-row">
              <label>{lang === "ko" ? "가격" : "Rate"}</label>
              <div className="bulk-input">
                <span className="prefix">₩</span>
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder={lang === "ko" ? "예: 158000" : "e.g. 158000"}
                  value={bulkRate}
                  onChange={(e) => setBulkRate(e.target.value)}
                  style={{ flex: 1, border: 0, paddingLeft: 0 }}
                />
              </div>
            </div>
            <div className="bulk-row">
              <label>{lang === "ko" ? "재고 (가용 객실)" : "Inventory (available)"}</label>
              <div className="bulk-input">
                <input
                  type="number"
                  className="input"
                  placeholder={lang === "ko" ? "예: 10" : "e.g. 10"}
                  value={bulkInventory}
                  onChange={(e) => setBulkInventory(e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
            </div>
            <div className="bulk-row">
              <label>{lang === "ko" ? "최소 숙박" : "Min stay"}</label>
              <div className="bulk-input">
                <input
                  type="number"
                  className="input"
                  placeholder={lang === "ko" ? "예: 2" : "e.g. 2"}
                  value={bulkMinStay}
                  onChange={(e) => setBulkMinStay(e.target.value)}
                  style={{ flex: 1 }}
                />
                <span className="text-muted" style={{ fontSize: 11 }}>{lang === "ko" ? "박" : "nights"}</span>
              </div>
            </div>
            <div className="bulk-row">
              <label>{lang === "ko" ? "적용 채널 (가격용)" : "Channels (for rate)"}</label>
              <div className="ch-checks">
                {optimisticGrid.channels.map((c) => {
                  const ch = channelById(c)!;
                  return (
                    <label key={c} className="ch-check">
                      <input
                        type="checkbox"
                        checked={bulkChannels.includes(c)}
                        onChange={() => toggleBulkChannel(c)}
                      />
                      <span className={`dot ${ch.cls}`} />
                      <span>{ch.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bulk-foot">
            <div style={{ flex: 1, minWidth: 0 }}>
              {bulkError && <span style={{ color: "var(--bad)", fontSize: 11 }}>{bulkError}</span>}
              {bulkOk && <span style={{ color: "var(--ok)", fontSize: 11 }}>{bulkOk}</span>}
              {!bulkError && !bulkOk && (
                <span className="text-muted" style={{ fontSize: 11 }}>
                  {lang === "ko" ? "예상 영향:" : "Will update:"} {(Math.abs(selection.end - selection.start) + 1) * (1 + bulkChannels.length)} {lang === "ko" ? "셀" : "cells"}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn ghost sm" onClick={closeBulk} disabled={pending}>{t.cancel}</button>
              <button className="btn primary sm" onClick={submitBulk} disabled={pending}>
                {pending ? (lang === "ko" ? "적용 중…" : "Applying…") : t.apply}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .cal-page { display: flex; flex-direction: column; height: 100%; min-height: 0; }
        .cal-tools {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 24px; gap: 12px;
          border-bottom: 1px solid var(--bd-1);
          background: var(--bg);
        }
        .cal-tools .left, .cal-tools .right { display: flex; align-items: center; gap: 6px; }
        .seg { display: inline-flex; background: var(--bg-mute); border: 1px solid var(--bd-1); border-radius: var(--r-sm); padding: 2px; margin-left: 4px; }
        .seg-btn { border: 0; background: transparent; padding: 2px 10px; height: 22px; font: inherit; font-size: var(--fs-xs); color: var(--t-2); border-radius: 4px; cursor: pointer; font-weight: 500; }
        .seg-btn.active { background: var(--bg); color: var(--t-1); box-shadow: var(--shadow-1); }
        .kbd-hint { display: inline-flex; align-items: center; justify-content: center; min-width: 14px; height: 14px; padding: 0 3px; margin-left: 4px; background: var(--bg-mute); border: 1px solid var(--bd-2); border-bottom-width: 2px; border-radius: 3px; font-size: 9px; font-family: var(--font-mono); color: var(--t-3); }
        .ch-filter { display: inline-flex; gap: 4px; padding: 0 6px; align-items: center; border-left: 1px solid var(--bd-2); margin-left: 4px; height: 22px; }
        .ch-toggle { border: 1px solid var(--bd-1); background: var(--bg); width: 22px; height: 22px; padding: 0; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;}
        .ch-toggle.off { background: var(--bg-mute); }
        .ch-toggle .dot { width: 10px; height: 10px; border-radius: 2px; }

        .legend { display: flex; gap: 12px; margin-right: 8px; font-size: var(--fs-xs); color: var(--t-3); align-items: center;}
        .legend span { display: inline-flex; align-items: center; gap: 5px;}
        .lg-d { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
        .lg-booked { background: var(--cal-booked); border: 1px solid #93c5fd; }
        .lg-blocked { background: var(--cal-blocked); border: 1px solid #fca5a5;}
        .lg-held    { background: var(--cal-held); border: 1px solid #fcd34d;}
        .lg-over    { background: #fee2e2; border: 1px solid var(--bad);}

        .cal-wrap { flex: 1; min-height: 0; overflow: auto; background: var(--bg); }
        .cal-grid {
          display: grid;
          grid-template-columns: 200px 1fr;
          min-width: max-content;
        }
        .cal-corner {
          position: sticky; top: 0; left: 0; z-index: 5;
          background: var(--bg); border-right: 1px solid var(--bd-2); border-bottom: 1px solid var(--bd-2);
          padding: 12px 14px;
          display: flex; align-items: center;
        }
        .cal-head-row {
          position: sticky; top: 0; z-index: 4;
          background: var(--bg); border-bottom: 1px solid var(--bd-2);
          display: grid;
          grid-template-columns: repeat(${days}, minmax(72px, 1fr));
        }
        .cal-head { padding: 8px 0; text-align: center; border-left: 1px solid var(--bd-1); font-size: var(--fs-sm); color: var(--t-3); }
        .cal-head.wknd { background: var(--cal-weekend); }
        .cal-head.today { background: var(--acc-soft); color: var(--acc-text); }
        .cal-head .dow { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
        .cal-head .dom { font-size: 16px; font-weight: 600; color: var(--t-1); margin-top: 2px;}
        .cal-head.today .dom { color: var(--acc-text); }

        .cal-rt {
          position: sticky; left: 0; z-index: 2;
          background: var(--bg); border-right: 1px solid var(--bd-2); border-bottom: 1px solid var(--bd-1);
          padding: 8px 14px 8px 6px;
          display: flex; align-items: center; gap: 6px;
        }
        .cal-rt.sub-row { padding: 4px 14px 4px 28px; background: var(--bg-1); }
        .rt-toggle { border: 0; background: transparent; cursor: pointer; color: var(--t-3); padding: 2px; display: flex; }
        .rt-meta { flex: 1; min-width: 0; }
        .rt-name { font-size: var(--fs-md); font-weight: 600; color: var(--t-1); }
        .rt-sub { font-size: 11px; }
        .sub-spacer { width: 14px; }

        .cal-row { display: grid; grid-template-columns: repeat(${days}, minmax(72px, 1fr)); border-bottom: 1px solid var(--bd-1); }
        .cal-row.rate { background: var(--bg-1); }

        .cal-cell { border-left: 1px solid var(--bd-1); padding: 4px 6px; position: relative; cursor: pointer; user-select: none; }
        .cal-cell.wknd { background: var(--cal-weekend); }
        .cal-row.rate .cal-cell.wknd { background: #f5f5fa; }
        .theme-dark .cal-row.rate .cal-cell.wknd { background: #161620;}
        .cal-cell.today { box-shadow: inset 2px 0 0 var(--acc); }
        .cal-cell.sel  { background: var(--acc-soft); box-shadow: inset 0 0 0 1px var(--acc);}
        .cal-cell:hover { background: var(--bg-hover);}

        .inline-err {
          position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 70;
          background: var(--bad-soft); color: var(--bad);
          padding: 8px 12px; border-radius: 8px; font-size: 12px;
          display: inline-flex; align-items: center; gap: 8px;
          box-shadow: var(--shadow-pop, 0 4px 16px rgba(0,0,0,.18));
        }
        .inline-err .btn.xs { padding: 0; height: 16px; width: 16px; min-width: 16px; }
        .cal-cell.editing { background: var(--acc-soft); padding: 0; box-shadow: inset 0 0 0 1.5px var(--acc); cursor: text; }
        .cal-cell .inline-rate-in {
          width: 100%; height: 100%; min-height: 22px;
          border: 0; background: transparent; outline: none;
          padding: 4px 6px; font: inherit; font-size: 12px; font-weight: 600;
          text-align: right; color: var(--t-1);
        }
        .cal-cell .inline-rate-in:disabled { opacity: 0.6; }
        .cal-cell .inline-edit-btn {
          position: absolute; top: 2px; right: 2px;
          width: 14px; height: 14px; padding: 0;
          border: 0; border-radius: 3px;
          background: var(--bg-elev); color: var(--t-3);
          display: none; align-items: center; justify-content: center;
          cursor: pointer; opacity: 0.7;
        }
        .cal-cell.rate-cell:hover .inline-edit-btn { display: inline-flex; }
        .cal-cell .inline-edit-btn:hover { color: var(--acc); opacity: 1; }
        .cal-cell.inv { padding: 6px 8px; }
        .cal-cell.inv .cell-num { font-size: 13px; font-weight: 600; color: var(--t-1); text-align: right; margin-top: 4px; }
        .cal-cell.inv .cell-bar { width: 100%; }
        .bar-bg { height: 4px; background: var(--bg-mute); border-radius: 2px; overflow: hidden; }
        .bar-fill { height: 100%; background: var(--acc); border-radius: 2px; }
        .cal-cell.over { background: #fee2e2; }
        .cal-cell.over .bar-fill { background: var(--bad);}
        .over-txt { color: var(--bad); font-weight: 700; }
        .cal-cell.blocked { background: var(--cal-blocked); }
        .cal-cell.blocked .bar-fill { background: var(--bad); opacity: 0.5;}

        .rate-cell { padding: 4px 8px; }
        .rate-val { font-size: 12px; color: var(--t-2); text-align: right; font-weight: 500;}

        .cal-row.span-row { position: relative; height: 32px;}
        .cal-cell.bg { padding: 0; cursor: default;}
        .cal-cell.bg:hover { background: transparent; }
        .span-overlay { position: absolute; left: 0; right: 0; top: 4px; bottom: 4px; pointer-events: none; }
        .booking-span {
          position: absolute; top: 0; bottom: 0;
          display: flex; align-items: center; gap: 5px;
          padding: 0 8px;
          border-radius: 4px;
          background: var(--cal-booked);
          font: inherit;
          font-size: 11px; font-weight: 500; color: var(--t-1);
          overflow: hidden; white-space: nowrap;
          pointer-events: auto; cursor: pointer;
          box-shadow: var(--shadow-1);
          border: 1px solid transparent;
          text-align: left;
        }
        .booking-span:hover { border-color: var(--acc); transform: translateY(-1px); transition: transform .12s, border-color .12s; }
        .booking-span:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; }
        .booking-span .dot { width: 7px; height: 7px; border-radius: 2px; flex: 0 0 7px; }
        .booking-span.ch-airbnb  { background: #ffe4ea;}
        .booking-span.ch-booking { background: #dbeafe;}
        .booking-span.ch-agoda   { background: #ffe4d4;}
        .booking-span.ch-trip    { background: #dbeafe;}
        .booking-span.ch-direct  { background: #ede9fe;}
        .booking-span.ch-fb      { background: #dbeafe;}
        .theme-dark .booking-span { background: var(--cal-booked); color: var(--t-1);}

        .overbook-flag {
          position: absolute; top: 0; bottom: 0;
          display: flex; align-items: center; justify-content: center; gap: 4px;
          background: var(--bad); color: white;
          font-size: 10px; font-weight: 600;
          border-radius: 4px;
          pointer-events: auto;
          z-index: 2;
          animation: pulse 1.6s infinite;
        }
        @keyframes pulse { 0%,100% { opacity: 1;} 50% { opacity: .7;} }

        .bulk-pop { position: fixed; right: 24px; bottom: 24px; width: 360px; background: var(--bg-elev); border: 1px solid var(--bd-2); border-radius: var(--r-lg); box-shadow: var(--shadow-pop); z-index: 50; overflow: hidden; }
        .bulk-head { display: flex; justify-content: space-between; align-items: flex-start; padding: 14px 16px 12px; border-bottom: 1px solid var(--bd-1);}
        .bulk-body { padding: 12px 16px; display: flex; flex-direction: column; gap: 10px;}
        .bulk-row label { display: block; font-size: var(--fs-xs); color: var(--t-3); margin-bottom: 4px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em;}
        .bulk-input { display: flex; align-items: center; gap: 6px; border: 1px solid var(--bd-2); border-radius: var(--r-sm); padding: 0 8px; height: 32px; background: var(--bg);}
        .bulk-input .prefix { color: var(--t-3); font-size: 13px;}
        .bulk-input .input { border: 0; height: 30px; padding: 0;}
        .bulk-input .input:focus { box-shadow: none;}
        .bulk-foot { padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--bd-1); background: var(--bg-1);}

        .mini-ch { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-xs); color: var(--t-2); font-weight: 500;}
        .mini-ch .dot { width: 7px; height: 7px; border-radius: 2px; flex: 0 0 7px;}
      `}</style>
    </div>
  );
};
