"use client";

import { useState } from "react";
import { useApp } from "@/lib/app-context";
import { I } from "@/components/icons";
import type { HotelSummaryRow } from "@/lib/queries";

export function AdminHotelsClient({ hotels }: { hotels: HotelSummaryRow[] }) {
  const { lang } = useApp();
  const [query, setQuery] = useState("");

  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed
    ? hotels.filter((h) => h.name.toLowerCase().includes(trimmed) || h.id.toLowerCase().includes(trimmed))
    : hotels;

  const totalRevenue = hotels.reduce((s, h) => s + h.kpis.revenue, 0);
  const totalBookings = hotels.reduce((s, h) => s + h.kpis.bookingsCount, 0);
  const totalNeeds = hotels.reduce((s, h) => s + h.kpis.needsAttention, 0);

  return (
    <div className="page">
      <div className="header">
        <div>
          <h1>{lang === "ko" ? "호텔 관리" : "Hotel admin"}</h1>
          <div className="sub text-muted">
            {lang === "ko"
              ? `${hotels.length}개 호텔 · 지난 30일 합계 ₩${totalRevenue.toLocaleString()} (${totalBookings}건)`
              : `${hotels.length} hotels · ₩${totalRevenue.toLocaleString()} / ${totalBookings} bookings (last 30d)`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {totalNeeds > 0 && (
            <span className="pill bad" title={lang === "ko" ? "전체 호텔의 미해결 경고" : "Open warnings across all hotels"}>
              <I.warn size={11} /> {totalNeeds}
            </span>
          )}
        </div>
      </div>

      <section className="card">
        <div className="sec-h">
          <div>
            <div className="title">{lang === "ko" ? "호텔" : "Hotels"}</div>
            <div className="sub">{filtered.length} / {hotels.length}</div>
          </div>
          <div className="search">
            <I.search size={12} />
            <input
              type="text"
              placeholder={lang === "ko" ? "이름 / ID 검색…" : "Search name / id…"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="empty">
            {lang === "ko" ? "조건에 맞는 호텔이 없습니다." : "No hotels match the filter."}
          </div>
        ) : (
          <table className="t-list">
            <thead>
              <tr>
                <th>{lang === "ko" ? "호텔" : "Hotel"}</th>
                <th className="r">{lang === "ko" ? "객실" : "Rooms"}</th>
                <th className="r">{lang === "ko" ? "채널" : "Channels"}</th>
                <th className="r">{lang === "ko" ? "30일 예약" : "30d bookings"}</th>
                <th className="r">{lang === "ko" ? "30일 매출" : "30d revenue"}</th>
                <th className="r">{lang === "ko" ? "점유" : "Occupancy"}</th>
                <th className="r">{lang === "ko" ? "주의" : "Warnings"}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((h) => (
                <tr key={h.id} className={h.isCurrent ? "current" : ""}>
                  <td>
                    <div className="hcell">
                      <span className="hname">
                        {h.name}
                        {h.isCurrent && (
                          <span className="active-pill" title={lang === "ko" ? "현재 활성 호텔" : "Current active hotel"}>
                            {lang === "ko" ? "활성" : "Active"}
                          </span>
                        )}
                      </span>
                      <span className="hid mono text-muted">{h.id.slice(-8)}</span>
                    </div>
                  </td>
                  <td className="r num">{h.kpis.rooms}</td>
                  <td className="r num">{h.kpis.channels}</td>
                  <td className="r num">{h.kpis.bookingsCount}</td>
                  <td className="r num" style={{ fontWeight: 600 }}>
                    ₩{h.kpis.revenue.toLocaleString()}
                  </td>
                  <td className="r">
                    <div className="occ-bar">
                      <div className="fill" style={{ width: `${h.kpis.occupancyPct}%` }} />
                    </div>
                    <span className="num text-muted" style={{ fontSize: 11, marginLeft: 6 }}>
                      {h.kpis.occupancyPct}%
                    </span>
                  </td>
                  <td className="r">
                    {h.kpis.needsAttention > 0 ? (
                      <span className="pill bad sm">{h.kpis.needsAttention}</span>
                    ) : (
                      <span className="text-muted" style={{ fontSize: 11 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <div className="sec-h">
          <div className="title">{lang === "ko" ? "테넌시 안내" : "Tenancy notes"}</div>
        </div>
        <div className="info-body">
          <div>
            {lang === "ko"
              ? "활성 호텔은 Clerk Organization의 publicMetadata.hotelId 또는 user.publicMetadata.hotelId로 결정됩니다. 다른 호텔로 전환하려면 Clerk 대시보드에서 메타데이터를 업데이트하세요."
              : "The active hotel is resolved from the Clerk org's publicMetadata.hotelId, falling back to the user's. Switch hotels by updating the metadata in the Clerk dashboard."}
          </div>
        </div>
      </section>

      <style>{`
        .page { padding: 20px 24px 32px; display: flex; flex-direction: column; gap: 16px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .header h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin: 0; color: var(--t-1); }
        .header .sub { font-size: 12px; margin-top: 4px; }
        .empty { padding: 32px; text-align: center; color: var(--t-3); font-size: 13px; }
        .search {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 8px; border: 1px solid var(--bd-1); border-radius: 6px;
          background: var(--bg-elev);
        }
        .search input { border: 0; background: transparent; outline: none; font: inherit; font-size: 12px; min-width: 160px; }
        .t-list { width: 100%; border-collapse: collapse; font-size: var(--fs-md); }
        .t-list th { font-weight: 500; color: var(--t-3); text-align: left; padding: 8px 16px; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.04em; background: var(--bg-1); border-bottom: 1px solid var(--bd-1);}
        .t-list th.r, .t-list td.r { text-align: right; }
        .t-list td { padding: 12px 16px; border-bottom: 1px solid var(--bd-1); color: var(--t-1); font-variant-numeric: tabular-nums;}
        .t-list tr:last-child td { border-bottom: 0;}
        .t-list tr.current td { background: var(--acc-soft); }
        .hcell { display: flex; flex-direction: column; gap: 2px; }
        .hname { font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
        .active-pill {
          background: var(--acc); color: white;
          font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
          padding: 1px 6px; border-radius: 999px;
        }
        .hid { font-size: 10px; }
        .occ-bar {
          display: inline-block; width: 80px; height: 6px;
          background: var(--bg-mute); border-radius: 999px; overflow: hidden;
          vertical-align: middle;
        }
        .occ-bar .fill { height: 100%; background: var(--acc); border-radius: 999px; }
        .pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; }
        .pill.bad { background: var(--bad-soft); color: var(--bad); }
        .pill.sm { padding: 1px 6px; font-size: 10px; }
        .info-body { padding: 14px 16px; font-size: 12px; color: var(--t-2); line-height: 1.6; }
      `}</style>
    </div>
  );
}
