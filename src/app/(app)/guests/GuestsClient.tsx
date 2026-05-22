"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { I } from "@/components/icons";
import type { GuestCrmPage } from "@/lib/queries";

interface FilterState {
  q: string;
  countries: string[];
  tags: string[];
  minLtv: number;
  hasUpcoming: boolean;
}

export function GuestsClient({ data, initialFilter }: { data: GuestCrmPage; initialFilter: FilterState }) {
  const { lang } = useApp();
  const router = useRouter();

  const [q, setQ] = useState(initialFilter.q);
  const [countries, setCountries] = useState<string[]>(initialFilter.countries);
  const [tags, setTags] = useState<string[]>(initialFilter.tags);
  const [minLtv, setMinLtv] = useState<number>(initialFilter.minLtv);
  const [hasUpcoming, setHasUpcoming] = useState<boolean>(initialFilter.hasUpcoming);

  // URL sync — debounced. Mirrors the bookings page pattern.
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    const handle = setTimeout(() => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (countries.length > 0) params.set("country", countries.join(","));
      if (tags.length > 0) params.set("tag", tags.join(","));
      if (minLtv > 0) params.set("minLtv", String(minLtv));
      if (hasUpcoming) params.set("upcoming", "1");
      const qs = params.toString();
      router.replace(qs ? `/guests?${qs}` : "/guests", { scroll: false });
    }, 250);
    return () => clearTimeout(handle);
  }, [q, countries, tags, minLtv, hasUpcoming, router]);

  const toggle = <T extends string>(arr: T[], setArr: (a: T[]) => void, v: T) => {
    setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };

  const exportCsv = () => {
    const headers = ["ID", "Name", "Email", "Phone", "Country", "Language", "Tags", "Bookings", "LTV", "LastStay", "NextStay"];
    const escape = (v: unknown) => {
      const s = (v ?? "").toString();
      return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const r of data.rows) {
      lines.push([
        r.id, r.name, r.email ?? "", r.phone ?? "", r.country ?? "", r.language ?? "",
        r.tags.join("|"), r.bookings, r.ltv, r.lastStayIso ?? "", r.nextStayIso ?? "",
      ].map(escape).join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `guests-${new Date().toISOString().slice(0, 10)}-${data.rows.length}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      <div className="header">
        <div>
          <h1>{lang === "ko" ? "게스트" : "Guests"}</h1>
          <div className="sub text-muted">
            {lang === "ko" ? `${data.total}명 매칭 / 전체 ${data.countryFacet.length}개국` : `${data.total} matched · ${data.countryFacet.length} countries`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn sm ghost" onClick={exportCsv} disabled={data.rows.length === 0}>
            <I.download size={11} /> CSV ({data.rows.length})
          </button>
        </div>
      </div>

      <section className="card">
        <div className="filters">
          <div className="row search">
            <I.search size={13} />
            <input
              type="text"
              placeholder={lang === "ko" ? "이름 / 이메일 / 전화 검색…" : "Name / email / phone…"}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q && (
              <button className="btn xs ghost icon" onClick={() => setQ("")} aria-label="clear">
                <I.close size={11} />
              </button>
            )}
          </div>

          <div className="row">
            <label>{lang === "ko" ? "국가" : "Country"}</label>
            <div className="chips">
              {data.countryFacet.length === 0 ? (
                <span className="text-muted" style={{ fontSize: 11 }}>—</span>
              ) : data.countryFacet.map((c) => (
                <button
                  key={c}
                  className={`chip ${countries.includes(c) ? "active" : ""}`}
                  onClick={() => toggle(countries, setCountries, c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <label>{lang === "ko" ? "태그" : "Tags"}</label>
            <div className="chips">
              {data.tagFacet.length === 0 ? (
                <span className="text-muted" style={{ fontSize: 11 }}>{lang === "ko" ? "(태그 없음)" : "(no tags)"}</span>
              ) : data.tagFacet.map((t) => (
                <button
                  key={t}
                  className={`chip ${tags.includes(t) ? "active" : ""}`}
                  onClick={() => toggle(tags, setTags, t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <label>{lang === "ko" ? "최소 LTV (₩)" : "Min LTV (₩)"}</label>
            <input
              type="number"
              value={minLtv || ""}
              onChange={(e) => setMinLtv(parseInt(e.target.value, 10) || 0)}
              placeholder="0"
              step={100000}
              style={{ width: 160 }}
            />
            <label className="toggle">
              <input type="checkbox" checked={hasUpcoming} onChange={(e) => setHasUpcoming(e.target.checked)} />
              <span>{lang === "ko" ? "예정된 예약 있음만" : "Has upcoming"}</span>
            </label>
          </div>
        </div>
      </section>

      <section className="card">
        {data.rows.length === 0 ? (
          <div className="empty">{lang === "ko" ? "조건에 맞는 게스트 없음" : "No guests match"}</div>
        ) : (
          <table className="t-list">
            <thead>
              <tr>
                <th>{lang === "ko" ? "게스트" : "Guest"}</th>
                <th>{lang === "ko" ? "연락처" : "Contact"}</th>
                <th>{lang === "ko" ? "태그" : "Tags"}</th>
                <th className="r">{lang === "ko" ? "예약" : "Bookings"}</th>
                <th className="r">LTV</th>
                <th>{lang === "ko" ? "마지막 / 예정" : "Last / next"}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((g) => (
                <tr key={g.id}>
                  <td>
                    <Link href={`/guests/${g.id}`} className="name-link">
                      {g.countryFlag} {g.name}
                    </Link>
                  </td>
                  <td className="text-muted" style={{ fontSize: 11 }}>
                    {g.email ? <span>{g.email}</span> : null}
                    {g.email && g.phone ? <br /> : null}
                    {g.phone ? <span>{g.phone}</span> : null}
                    {!g.email && !g.phone && <span>—</span>}
                  </td>
                  <td>
                    <div className="tag-cell">
                      {g.tags.length === 0 ? <span className="text-muted">—</span> : g.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                    </div>
                  </td>
                  <td className="r num">{g.bookings}</td>
                  <td className="r num" style={{ fontWeight: 600 }}>₩{g.ltv.toLocaleString()}</td>
                  <td className="text-muted" style={{ fontSize: 11 }}>
                    {g.lastStayIso ? `← ${g.lastStayIso}` : "—"}
                    {g.nextStayIso && <><br />→ {g.nextStayIso}</>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <style>{`
        .page { padding: 20px 24px 32px; display: flex; flex-direction: column; gap: 16px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .header h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 2px; color: var(--t-1); }
        .header .sub { font-size: 12px; }
        .filters { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 10px; }
        .filters .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .filters label { font-size: 11px; color: var(--t-3); font-weight: 500; min-width: 80px; }
        .filters input[type="text"], .filters input[type="number"] {
          flex: 1; min-width: 200px; height: 32px; padding: 0 10px;
          border: 1px solid var(--bd-1); border-radius: 6px; background: var(--bg-elev); color: var(--t-1); font: inherit; font-size: 13px;
        }
        .filters .search input { flex: 1; }
        .filters .row.search { background: var(--bg-elev); padding: 0 10px; border: 1px solid var(--bd-1); border-radius: 6px; height: 32px; gap: 6px; }
        .filters .row.search input { border: 0; height: 28px; padding: 0; min-width: 0; }
        .chips { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; }
        .chip {
          padding: 3px 8px; border: 1px solid var(--bd-1); border-radius: 999px;
          background: var(--bg-elev); font: inherit; font-size: 11px; cursor: pointer; color: var(--t-2);
        }
        .chip.active { background: var(--acc); color: white; border-color: var(--acc); }
        .toggle { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; min-width: 0; }
        .toggle input { margin: 0; }
        .empty { padding: 32px; text-align: center; color: var(--t-3); font-size: 12px; }
        .t-list { width: 100%; border-collapse: collapse; font-size: var(--fs-md); }
        .t-list th { font-weight: 500; color: var(--t-3); text-align: left; padding: 8px 16px; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.04em; background: var(--bg-1); border-bottom: 1px solid var(--bd-1);}
        .t-list th.r, .t-list td.r { text-align: right; }
        .t-list td { padding: 10px 16px; border-bottom: 1px solid var(--bd-1); color: var(--t-1); font-variant-numeric: tabular-nums; }
        .t-list tr:last-child td { border-bottom: 0;}
        .name-link { color: var(--t-1); text-decoration: none; font-weight: 500; }
        .name-link:hover { color: var(--acc); }
        .tag-cell { display: flex; flex-wrap: wrap; gap: 3px; }
        .tag { background: var(--acc-soft); color: var(--acc); padding: 1px 6px; border-radius: 999px; font-size: 10px; font-weight: 500; }
        .btn.xs { height: 22px; padding: 0 6px; font-size: 11px; }
      `}</style>
    </div>
  );
}
