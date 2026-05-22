"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { I } from "../icons";
import { channelById, type Lang } from "@/lib/i18n";
import type { ChannelMappingRow, ChannelOverviewRow, MiddlewareRow, RateParityReport, SyncLogRow } from "@/lib/queries";
import {
  connectMiddleware,
  disconnectMiddleware,
  generateChannelICalExportToken,
  revokeChannelICalExportToken,
  setChannelICalUrl,
  setChannelMapping,
  syncMiddleware,
  syncNowChannel,
} from "@/lib/actions";
import type { MiddlewareType } from "@prisma/client";

const OP_LABELS: Record<string, { ko: string; en: string }> = {
  push_inventory: { ko: "재고 푸시", en: "Push inventory" },
  push_rates: { ko: "가격 푸시", en: "Push rates" },
  pull_bookings: { ko: "예약 가져오기", en: "Pull bookings" },
  rate_mismatch: { ko: "가격 충돌", en: "Rate mismatch" },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function formatHm(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface ChannelsProps {
  lang?: Lang;
  overview: ChannelOverviewRow[];
  syncLog: SyncLogRow[];
  middlewares: MiddlewareRow[];
  mappings: ChannelMappingRow[];
  parity: RateParityReport;
}

const MIDDLEWARE_LABELS: Record<MiddlewareType, { name: string; tagline: string; color: string }> = {
  hostaway: { name: "Hostaway", tagline: "Global vacation-rental PMS · 100+ OTA", color: "#5b6cff" },
  siteminder: { name: "SiteMinder", tagline: "Hotel-grade · 450+ channels", color: "#ff6b35" },
  rategain: { name: "RateGain", tagline: "Enterprise revenue · BI", color: "#0aa688" },
  ezpms: { name: "EzPMS", tagline: "한국 PMS · 야놀자/여기어때 통합", color: "#ec5a3c" },
};

export const Channels = ({ lang = "ko", overview, syncLog, middlewares, mappings, parity }: ChannelsProps) => {
  const router = useRouter();
  const [add, setAdd] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [errorId, setErrorId] = useState<string | null>(null);
  const [mwPending, setMwPending] = useState<MiddlewareType | null>(null);
  const [mwError, setMwError] = useState<string | null>(null);

  const onConnect = (type: MiddlewareType) => {
    setMwError(null);
    setMwPending(type);
    startTransition(async () => {
      const r = await connectMiddleware({
        type,
        propertyId: `demo-${Math.random().toString(36).slice(2, 8)}`,
        apiKey: "demo-key",
      });
      setMwPending(null);
      if (!r.ok) setMwError(r.error);
      else router.refresh();
    });
  };

  const onDisconnect = (id: string, type: MiddlewareType) => {
    setMwError(null);
    setMwPending(type);
    startTransition(async () => {
      const r = await disconnectMiddleware(id);
      setMwPending(null);
      if (!r.ok) setMwError(r.error);
      else router.refresh();
    });
  };

  const middlewareByType = new Map(middlewares.map((m) => [m.type, m]));

  const [icalEditId, setIcalEditId] = useState<string | null>(null);
  const [icalDraft, setIcalDraft] = useState("");
  const [icalPending, setIcalPending] = useState(false);
  const openIcal = (dbId: string, current: string | null) => {
    setIcalEditId(dbId);
    setIcalDraft(current ?? "");
  };
  const saveIcal = (dbId: string) => {
    setIcalPending(true);
    startTransition(async () => {
      await setChannelICalUrl(dbId, icalDraft || null);
      setIcalPending(false);
      setIcalEditId(null);
      router.refresh();
    });
  };

  const [exportPendingId, setExportPendingId] = useState<string | null>(null);
  const onGenerateExport = (dbId: string) => {
    setExportPendingId(dbId);
    startTransition(async () => {
      await generateChannelICalExportToken(dbId);
      setExportPendingId(null);
      router.refresh();
    });
  };
  const onRevokeExport = (dbId: string) => {
    setExportPendingId(dbId);
    startTransition(async () => {
      await revokeChannelICalExportToken(dbId);
      setExportPendingId(null);
      router.refresh();
    });
  };

  // Mapping editor state — keyed by `${channelDbId}:${roomTypeId}`
  const [mappingDrafts, setMappingDrafts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const m of mappings) init[`${m.channelDbId}:${m.roomTypeId}`] = m.externalId ?? "";
    return init;
  });
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const saveMapping = (channelDbId: string, roomTypeId: string) => {
    const key = `${channelDbId}:${roomTypeId}`;
    setSavingKey(key);
    startTransition(async () => {
      const r = await setChannelMapping(channelDbId, roomTypeId, mappingDrafts[key] || null);
      setSavingKey(null);
      if (r.ok) {
        setSavedKey(key);
        router.refresh();
        setTimeout(() => setSavedKey((k) => (k === key ? null : k)), 1200);
      }
    });
  };
  const channelMappings = (channelDbId: string) => mappings.filter((m) => m.channelDbId === channelDbId);

  const [optimisticOverview, addOptimisticChannel] = useOptimistic(
    overview,
    (state, patch: { dbId: string; lastSync?: string; status?: ChannelOverviewRow["status"] }) =>
      state.map((c) =>
        c.dbId === patch.dbId
          ? { ...c, lastSync: patch.lastSync ?? c.lastSync, status: patch.status ?? c.status }
          : c,
      ),
  );

  const onSync = (dbId: string) => {
    setErrorId(null);
    setPendingId(dbId);
    startTransition(async () => {
      addOptimisticChannel({ dbId, lastSync: new Date().toISOString(), status: "synced" });
      const r = await syncNowChannel(dbId);
      setPendingId(null);
      if (!r.ok) setErrorId(dbId);
      else router.refresh();
    });
  };

  return (
    <div className="page">
      <div className="ch-grid">
        {optimisticOverview.map((d) => {
          const c = channelById(d.id);
          if (!c) return null;
          return (
            <div key={d.id} className="ch-card">
              <div className="ch-card-h">
                <div className="ch-icon" style={{ background: c.color }}>
                  <span>{c.short}</span>
                </div>
                <div className="ch-card-meta">
                  <div className="nm">{c.name}</div>
                  <div className="st">
                    {d.status === "synced" && <span className="pill ok dot">{lang === "ko" ? "연결됨" : "Connected"}</span>}
                    {d.status === "syncing" && <span className="pill info dot">{lang === "ko" ? "동기화 중" : "Syncing"}</span>}
                    {d.status === "delayed" && <span className="pill warn dot">{lang === "ko" ? "지연" : "Delayed"}</span>}
                    {d.status === "error" && <span className="pill bad dot">{lang === "ko" ? "오류" : "Error"}</span>}
                    {d.issues > 0 && <span className="pill bad" style={{ height: 18 }}><I.warn size={10} /> {d.issues}</span>}
                  </div>
                </div>
                <button className="btn ghost icon"><I.more size={14} /></button>
              </div>
              <div className="ch-card-body">
                <div className="ch-stat">
                  <div className="lbl tracker">{lang === "ko" ? "리스팅" : "Listings"}</div>
                  <div className="val num">{d.listings}/5</div>
                </div>
                <div className="ch-stat">
                  <div className="lbl tracker">{lang === "ko" ? "예약 (월)" : "Bookings"}</div>
                  <div className="val num">{d.bookings}</div>
                </div>
                <div className="ch-stat">
                  <div className="lbl tracker">{lang === "ko" ? "수익 (월)" : "Revenue"}</div>
                  <div className="val num">₩{(d.revenue / 1_000_000).toFixed(1)}M</div>
                </div>
                <div className="ch-stat">
                  <div className="lbl tracker">{lang === "ko" ? "수수료" : "Commission"}</div>
                  <div className="val num">{d.fee}%</div>
                </div>
              </div>
              <div className="ch-card-foot">
                <span className="text-muted" style={{ fontSize: 11 }}>
                  <I.refresh size={11} style={{ verticalAlign: -2 }} /> {lang === "ko" ? "마지막" : "Last sync"} {formatHm(d.lastSync)}
                  {d.icalUrl && <span title={d.icalUrl} style={{ marginLeft: 6, color: "var(--info)" }}>📅 iCal</span>}
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    className="btn sm"
                    onClick={() => onSync(d.dbId)}
                    disabled={pendingId === d.dbId}
                    title={errorId === d.dbId ? (lang === "ko" ? "동기화 실패" : "Sync failed") : undefined}
                  >
                    <I.refresh size={11} className={pendingId === d.dbId ? "spin" : undefined} />
                    {pendingId === d.dbId
                      ? lang === "ko" ? "동기화 중…" : "Syncing…"
                      : lang === "ko" ? "지금 동기화" : "Sync now"}
                  </button>
                  <button className="btn sm ghost icon" onClick={() => openIcal(d.dbId, d.icalUrl)} title="iCal URL">
                    <I.setting size={11} />
                  </button>
                </div>
              </div>
              {icalEditId === d.dbId && (
                <div className="ical-form">
                  <label className="text-muted" style={{ fontSize: 11 }}>
                    {lang === "ko" ? "인바운드: iCal URL (.ics 피드)" : "Inbound: iCal URL (.ics feed)"}
                  </label>
                  <input
                    className="input"
                    placeholder="https://www.airbnb.com/calendar/ical/…"
                    value={icalDraft}
                    onChange={(e) => setIcalDraft(e.target.value)}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                  <div style={{ display: "flex", gap: 4, marginTop: 6, justifyContent: "flex-end" }}>
                    <button className="btn sm ghost" onClick={() => setIcalEditId(null)} disabled={icalPending}>
                      {lang === "ko" ? "취소" : "Cancel"}
                    </button>
                    <button className="btn sm primary" onClick={() => saveIcal(d.dbId)} disabled={icalPending}>
                      {icalPending ? "…" : lang === "ko" ? "저장" : "Save"}
                    </button>
                  </div>
                  <div style={{ borderTop: "1px solid var(--bd-1)", marginTop: 10, paddingTop: 10 }}>
                    <label className="text-muted" style={{ fontSize: 11 }}>
                      {lang === "ko" ? "아웃바운드: 우리 예약을 .ics로 내보내기" : "Outbound: Export our bookings as .ics"}
                    </label>
                    {d.icalExportToken ? (
                      <>
                        <input
                          className="input"
                          readOnly
                          value={typeof window !== "undefined" ? `${window.location.origin}/api/ical/${d.icalExportToken}.ics` : `/api/ical/${d.icalExportToken}.ics`}
                          style={{ width: "100%", marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 10 }}
                          onFocus={(e) => e.currentTarget.select()}
                        />
                        <div style={{ display: "flex", gap: 4, marginTop: 6, justifyContent: "flex-end" }}>
                          <button className="btn sm ghost" onClick={() => onRevokeExport(d.dbId)} disabled={exportPendingId === d.dbId}>
                            {exportPendingId === d.dbId ? "…" : lang === "ko" ? "토큰 폐기" : "Revoke"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                        <button className="btn sm" onClick={() => onGenerateExport(d.dbId)} disabled={exportPendingId === d.dbId}>
                          <I.link size={11} /> {exportPendingId === d.dbId ? "…" : lang === "ko" ? "내보내기 URL 생성" : "Generate export URL"}
                        </button>
                      </div>
                    )}
                  </div>
                  <div style={{ borderTop: "1px solid var(--bd-1)", marginTop: 10, paddingTop: 10 }}>
                    <label className="text-muted" style={{ fontSize: 11 }}>
                      {lang === "ko" ? "객실 매핑 (OTA listing ID)" : "Room mappings (OTA listing IDs)"}
                    </label>
                    <div className="map-rows">
                      {channelMappings(d.dbId).map((m) => {
                        const key = `${m.channelDbId}:${m.roomTypeId}`;
                        const draft = mappingDrafts[key] ?? "";
                        const dirty = draft !== (m.externalId ?? "");
                        return (
                          <div key={key} className="map-row">
                            <span className="map-rt" title={m.roomTypeName}>{m.roomTypeName}</span>
                            <input
                              className="input"
                              placeholder={lang === "ko" ? "외부 ID" : "external ID"}
                              value={draft}
                              onChange={(e) => setMappingDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                              style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 10, height: 24 }}
                            />
                            <button
                              className={`btn sm ${dirty ? "primary" : "ghost"}`}
                              onClick={() => saveMapping(m.channelDbId, m.roomTypeId)}
                              disabled={!dirty || savingKey === key}
                              style={{ height: 24, padding: "0 8px", fontSize: 10 }}
                            >
                              {savingKey === key ? "…" : savedKey === key ? "✓" : lang === "ko" ? "저장" : "Save"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <button className="ch-add" onClick={() => setAdd(true)}>
          <I.plus size={20} />
          <span>{lang === "ko" ? "채널 추가" : "Add channel"}</span>
          <span className="text-muted" style={{ fontSize: 11 }}>
            {lang === "ko" ? "Expedia, 야놀자, 여기어때 외 12개" : "Expedia, Hotels.com & 12 more"}
          </span>
        </button>
      </div>

      <section className="card mw-card" style={{ marginTop: 12 }}>
        <div className="sec-h">
          <div>
            <div className="title">{lang === "ko" ? "채널 매니저 미들웨어" : "Channel manager middleware"}</div>
            <div className="sub">
              {lang === "ko" ? "한 통합으로 다수 OTA 동시 연동 (Phase 2)" : "One integration → many OTAs (Phase 2)"}
            </div>
          </div>
        </div>
        {mwError && <div style={{ padding: "8px 16px", color: "var(--bad)", background: "var(--bad-soft)", fontSize: 12 }}>{mwError}</div>}
        <div className="mw-grid">
          {(Object.keys(MIDDLEWARE_LABELS) as MiddlewareType[]).map((type) => {
            const meta = MIDDLEWARE_LABELS[type];
            const conn = middlewareByType.get(type);
            const isConnected = conn?.status === "connected";
            const isPending = mwPending === type;
            return (
              <div key={type} className={`mw-row ${isConnected ? "connected" : ""}`}>
                <div className="mw-icon" style={{ background: meta.color }}>{meta.name.charAt(0)}</div>
                <div className="mw-meta">
                  <div className="mw-name">{meta.name}</div>
                  <div className="mw-tag text-muted">{meta.tagline}</div>
                </div>
                <div className="mw-action">
                  {isConnected && conn ? (
                    <>
                      <span className="pill ok dot" style={{ height: 18 }}>{lang === "ko" ? "연결됨" : "Connected"}</span>
                      {type === "hostaway" && (
                        <button
                          className="btn sm"
                          onClick={() => {
                            setMwError(null);
                            setMwPending(type);
                            startTransition(async () => {
                              const r = await syncMiddleware(conn.id);
                              setMwPending(null);
                              if (!r.ok) setMwError(r.error);
                              else router.refresh();
                            });
                          }}
                          disabled={isPending}
                        >
                          <I.refresh size={11} /> {isPending ? "…" : lang === "ko" ? "동기화" : "Sync"}
                        </button>
                      )}
                      <button className="btn sm ghost" onClick={() => onDisconnect(conn.id, type)} disabled={isPending}>
                        {isPending ? "…" : lang === "ko" ? "해제" : "Disconnect"}
                      </button>
                    </>
                  ) : (
                    <button className="btn sm" onClick={() => onConnect(type)} disabled={isPending}>
                      <I.plug size={11} /> {isPending ? "…" : lang === "ko" ? "연결" : "Connect"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <div className="sec-h">
          <div>
            <div className="title">
              {lang === "ko" ? "가격 패리티" : "Rate parity"}
              <span className={`pill ${parity.violations.length > 0 ? "warn" : "ok"}`} style={{ marginLeft: 8, fontSize: 10 }}>
                {parity.violations.length}
              </span>
            </div>
            <div className="sub">
              {lang === "ko"
                ? `다음 7일 — 채널 간 최대 ${parity.thresholdPct}% 이상 차이가 나는 셀 (검사: ${parity.totalCells})`
                : `Next 7d — cells with channel spread ≥ ${parity.thresholdPct}% (inspected: ${parity.totalCells})`}
            </div>
          </div>
        </div>
        {parity.violations.length === 0 ? (
          <div className="empty">
            {lang === "ko"
              ? `채널 간 가격이 ${parity.thresholdPct}% 이내로 일치합니다.`
              : `Channel rates are within ${parity.thresholdPct}% of each other.`}
          </div>
        ) : (
          <table className="t-list">
            <thead>
              <tr>
                <th>{lang === "ko" ? "날짜" : "Date"}</th>
                <th>{lang === "ko" ? "객실" : "Room"}</th>
                <th className="r">{lang === "ko" ? "최저" : "Lowest"}</th>
                <th className="r">{lang === "ko" ? "최고" : "Highest"}</th>
                <th className="r">{lang === "ko" ? "차이" : "Spread"}</th>
              </tr>
            </thead>
            <tbody>
              {parity.violations.slice(0, 12).map((v, i) => {
                const minCh = channelById(v.minChannel);
                const maxCh = channelById(v.maxChannel);
                return (
                  <tr key={`${v.roomTypeId}-${v.date}-${i}`}>
                    <td className="mono">{v.date}</td>
                    <td>{v.roomTypeName}</td>
                    <td className="r">
                      <span className="mini-ch"><span className={`dot ${minCh?.cls ?? ""}`} />{minCh?.name ?? v.minChannel}</span>
                      <span className="num text-muted" style={{ marginLeft: 6 }}>₩{(v.minRate / 1000).toFixed(0)}K</span>
                    </td>
                    <td className="r">
                      <span className="mini-ch"><span className={`dot ${maxCh?.cls ?? ""}`} />{maxCh?.name ?? v.maxChannel}</span>
                      <span className="num text-muted" style={{ marginLeft: 6 }}>₩{(v.maxRate / 1000).toFixed(0)}K</span>
                    </td>
                    <td className="r">
                      <span className={`pill ${v.spreadPct >= 20 ? "bad" : "warn"}`}>+{v.spreadPct}%</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <div className="sec-h">
          <div>
            <div className="title">{lang === "ko" ? "동기화 로그" : "Sync log"}</div>
            <div className="sub">{lang === "ko" ? `최근 ${syncLog.length}건` : `Last ${syncLog.length}`}</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn sm ghost"><I.filter size={12} /> {lang === "ko" ? "필터" : "Filter"}</button>
            <button className="btn sm ghost"><I.download size={12} /> {lang === "ko" ? "내보내기" : "Export"}</button>
          </div>
        </div>
        <table className="t-list">
          <thead>
            <tr>
              <th style={{ width: 80 }}>{lang === "ko" ? "시각" : "Time"}</th>
              <th>{lang === "ko" ? "채널" : "Channel"}</th>
              <th>{lang === "ko" ? "작업" : "Operation"}</th>
              <th className="r">{lang === "ko" ? "대상" : "Target"}</th>
              <th>{lang === "ko" ? "결과" : "Result"}</th>
              <th className="r">{lang === "ko" ? "시간" : "Duration"}</th>
            </tr>
          </thead>
          <tbody>
            {syncLog.map((r) => {
              const c = channelById(r.channel)!;
              const opLabel = OP_LABELS[r.op];
              const op = opLabel ? (lang === "ko" ? opLabel.ko : opLabel.en) : r.op;
              return (
                <tr key={r.id}>
                  <td className="mono text-muted">{formatTime(r.occurredAt)}</td>
                  <td><span className="mini-ch"><span className={`dot ${c.cls}`} />{c.name}</span></td>
                  <td>{op}</td>
                  <td className="r text-muted">{r.target}</td>
                  <td>
                    {r.result === "success" && <span className="pill ok dot">{lang === "ko" ? "성공" : "Success"}</span>}
                    {r.result === "in_progress" && <span className="pill info dot">{lang === "ko" ? "진행중" : "In progress"}</span>}
                    {r.result === "warn" && <span className="pill warn dot">{r.note ?? (lang === "ko" ? "경고" : "Warning")}</span>}
                    {r.result === "error" && <span className="pill bad dot">{r.note ?? (lang === "ko" ? "오류" : "Error")}</span>}
                  </td>
                  <td className="r mono text-muted">{r.durationMs ? `${r.durationMs}ms` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {add && (
        <div className="modal-bg" onClick={() => setAdd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="md-head">
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{lang === "ko" ? "채널 추가" : "Add channel"}</div>
                <div className="text-muted" style={{ fontSize: 12 }}>
                  {lang === "ko" ? "OTA 또는 직접 채널 연결" : "Connect an OTA or direct channel"}
                </div>
              </div>
              <button className="btn ghost icon" onClick={() => setAdd(false)}><I.close size={14} /></button>
            </div>
            <div className="md-body">
              <div className="add-grid">
                {[
                  { id: "expedia", name: "Expedia", col: "#fdb913" },
                  { id: "hotelscom", name: "Hotels.com", col: "#d32f2f" },
                  { id: "yanolja", name: "야놀자", col: "#ec5a3c" },
                  { id: "ygkk", name: "여기어때", col: "#0066ff" },
                  { id: "naver", name: "네이버 예약", col: "#03c75a" },
                  { id: "google", name: "Google", col: "#4285f4" },
                  { id: "instagram", name: "Instagram", col: "#e1306c" },
                  { id: "kakao", name: "Kakao", col: "#fee500" },
                ].map((c) => (
                  <button key={c.id} className="add-tile">
                    <div className="add-ic" style={{ background: c.col }}>{c.name.charAt(0)}</div>
                    <div className="add-nm">{c.name}</div>
                    <div className="text-muted" style={{ fontSize: 11 }}>{lang === "ko" ? "연결" : "Connect"} →</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .page { padding: 20px 24px 32px;}
        .ch-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .ch-card { background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: var(--r-md); padding: 16px; display: flex; flex-direction: column; gap: 12px;}
        .ch-card-h { display: flex; align-items: center; gap: 10px;}
        .ch-icon { width: 36px; height: 36px; border-radius: 8px; color: white; font-weight: 700; font-size: 12px; display: flex; align-items: center; justify-content: center; flex: 0 0 36px; letter-spacing: 0.5px;}
        .ch-card-meta { flex: 1; min-width: 0;}
        .ch-card-meta .nm { font-size: var(--fs-md); font-weight: 600; color: var(--t-1);}
        .ch-card-meta .st { display: flex; gap: 4px; margin-top: 2px;}
        .ch-card-body { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; padding: 8px 0; border-top: 1px solid var(--bd-1); border-bottom: 1px solid var(--bd-1);}
        .ch-stat .lbl { font-size: 10px; color: var(--t-3); margin-bottom: 2px;}
        .ch-stat .val { font-size: 16px; font-weight: 600; color: var(--t-1); letter-spacing: -0.01em;}
        .ch-card-foot { display: flex; justify-content: space-between; align-items: center;}

        .ical-form { padding: 10px 14px 12px; border-top: 1px solid var(--bd-1); background: var(--bg-1); margin-top: 4px; }
        .ical-form .input { font-size: 11px; height: 28px; }
        .map-rows { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
        .map-row { display: flex; gap: 6px; align-items: center; }
        .map-rt { font-size: 11px; color: var(--t-2); width: 100px; flex: 0 0 100px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .ch-add { background: transparent; border: 1.5px dashed var(--bd-2); border-radius: var(--r-md); padding: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; cursor: pointer; color: var(--t-3); font: inherit; min-height: 200px;}
        .ch-add:hover { border-color: var(--acc); color: var(--acc); background: var(--acc-soft);}
        .ch-add span:first-of-type { font-size: var(--fs-md); font-weight: 600;}

        .t-list { width: 100%; border-collapse: collapse; font-size: var(--fs-md);}
        .t-list th { font-weight: 500; color: var(--t-3); text-align: left; padding: 8px 16px; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.04em; background: var(--bg-1); border-bottom: 1px solid var(--bd-1);}
        .t-list th.r, .t-list td.r { text-align: right;}
        .t-list td { padding: 10px 16px; border-bottom: 1px solid var(--bd-1); color: var(--t-1); font-variant-numeric: tabular-nums;}
        .t-list tr:last-child td { border-bottom: 0;}
        .mini-ch { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-xs); color: var(--t-2); font-weight: 500;}
        .mini-ch .dot { width: 7px; height: 7px; border-radius: 2px; flex: 0 0 7px;}

        .mw-card { padding-bottom: 4px; }
        .mw-grid { display: flex; flex-direction: column; }
        .mw-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--bd-1); }
        .mw-row:last-child { border-bottom: 0; }
        .mw-row.connected { background: var(--ok-soft); }
        .mw-icon { width: 32px; height: 32px; border-radius: 6px; color: white; font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center; flex: 0 0 32px; }
        .mw-meta { flex: 1; min-width: 0; }
        .mw-name { font-weight: 600; font-size: var(--fs-md); color: var(--t-1); }
        .mw-tag { font-size: 11px; }
        .mw-action { display: flex; gap: 6px; align-items: center; }

        .modal-bg { position: fixed; inset: 0; background: rgba(15,15,20,0.5); display: flex; align-items: center; justify-content: center; z-index: 100;}
        .modal { width: 600px; background: var(--bg-elev); border: 1px solid var(--bd-2); border-radius: var(--r-lg); box-shadow: var(--shadow-pop); overflow: hidden;}
        .md-head { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--bd-1);}
        .md-body { padding: 16px 20px;}
        .add-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;}
        .add-tile { background: transparent; border: 1px solid var(--bd-1); border-radius: var(--r-md); padding: 14px; cursor: pointer; font: inherit; display: flex; flex-direction: column; align-items: flex-start; gap: 6px;}
        .add-tile:hover { border-color: var(--acc); background: var(--acc-soft);}
        .add-ic { width: 28px; height: 28px; border-radius: 6px; color: white; font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center;}
        .add-nm { font-weight: 600; color: var(--t-1); font-size: var(--fs-md);}
      `}</style>
    </div>
  );
};
