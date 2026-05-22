"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { I } from "./icons";
import { STR, type Lang } from "@/lib/i18n";
import type { SavedFilterRow } from "@/lib/queries";

interface SidebarProps {
  lang?: Lang;
  savedFilters?: SavedFilterRow[];
}

interface ItemProps {
  href: string;
  icon: ReactNode;
  label: string;
  badge?: string;
  kbd?: string;
  active: boolean;
}

const Item = ({ href, icon, label, badge, kbd, active }: ItemProps) => (
  <Link href={href} className="side-item" data-active={active ? "true" : undefined}>
    <span className="ic">{icon}</span>
    <span className="lbl">{label}</span>
    {badge ? <span className="badge num">{badge}</span> : null}
    {kbd ? <span className="kbd">{kbd}</span> : null}
  </Link>
);

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);

export const Sidebar = ({ lang = "ko", savedFilters = [] }: SidebarProps) => {
  const t = STR[lang];
  const pathname = usePathname() ?? "/";

  const filtersByScope: Record<"bookings" | "messages", SavedFilterRow[]> = {
    bookings: savedFilters.filter((f) => f.scope === "bookings"),
    messages: savedFilters.filter((f) => f.scope === "messages"),
  };

  return (
    <aside className="sidebar">
      <div className="ws">
        <div className="ws-logo">SL</div>
        <div className="ws-meta">
          <div className="ws-name">{t.workspace}</div>
          <div className="ws-sub">{lang === "ko" ? "52 객실 · Pro" : "52 rooms · Pro"}</div>
        </div>
        <button className="btn icon ghost" aria-label="switch">
          <I.chevD size={14} />
        </button>
      </div>

      <div className="side-search">
        <I.search size={14} />
        <input placeholder={t.cmd} />
        <span className="kbd">⌘K</span>
      </div>

      <div className="side-section">
        <div className="side-label tracker">{t.sect.workspace}</div>
        <Item href="/" active={isActive(pathname, "/")} icon={<I.home size={15} />} label={t.nav.dashboard} kbd="G D" />
        <Item href="/calendar" active={isActive(pathname, "/calendar")} icon={<I.cal size={15} />} label={t.nav.calendar} kbd="G C" />
      </div>

      <div className="side-section">
        <div className="side-label tracker">{t.sect.operations}</div>
        <Item href="/bookings" active={isActive(pathname, "/bookings")} icon={<I.inbox size={15} />} label={t.nav.bookings} badge="14" />
        <Item href="/messages" active={isActive(pathname, "/messages")} icon={<I.msg size={15} />} label={t.nav.messages} badge="6" />
        <Item href="/guests" active={isActive(pathname, "/guests")} icon={<I.user size={15} />} label={lang === "ko" ? "게스트" : "Guests"} />
        <Item href="/rooms" active={isActive(pathname, "/rooms")} icon={<I.bed size={15} />} label={t.nav.rooms} />
        <Item href="/housekeeping" active={isActive(pathname, "/housekeeping")} icon={<I.sparkle size={15} />} label={lang === "ko" ? "객실 현황" : "Housekeeping"} />
      </div>

      <div className="side-section">
        <div className="side-label tracker">{t.sect.growth}</div>
        <Item href="/channels" active={isActive(pathname, "/channels")} icon={<I.plug size={15} />} label={t.nav.channels} />
        <Item href="/revenue" active={isActive(pathname, "/revenue")} icon={<I.chart size={15} />} label={t.nav.revenue} />
        <Item href="/analytics" active={isActive(pathname, "/analytics")} icon={<I.sparkle size={15} />} label={lang === "ko" ? "분석" : "Analytics"} />
        <Item href="/automations" active={isActive(pathname, "/automations")} icon={<I.zap size={15} />} label={t.nav.automations} />
      </div>

      {savedFilters.length > 0 && (
        <div className="side-section">
          <div className="side-label tracker">{lang === "ko" ? "저장된 필터" : "Saved filters"}</div>
          {filtersByScope.bookings.map((f) => {
            const qs = new URLSearchParams(f.params).toString();
            const href = `/bookings${qs ? `?${qs}` : ""}`;
            return (
              <Link key={f.id} href={href} className="side-item filter-item" title={`bookings · ${Object.entries(f.params).map(([k, v]) => `${k}=${v}`).join(", ")}`}>
                <span className="ic">{f.icon ?? "📋"}</span>
                <span className="lbl">{f.label}</span>
                {f.hitCount > 0 && <span className="kbd">{f.hitCount}</span>}
              </Link>
            );
          })}
          {filtersByScope.messages.map((f) => {
            const qs = new URLSearchParams(f.params).toString();
            const href = `/messages${qs ? `?${qs}` : ""}`;
            return (
              <Link key={f.id} href={href} className="side-item filter-item" title={`messages · ${Object.entries(f.params).map(([k, v]) => `${k}=${v}`).join(", ")}`}>
                <span className="ic">{f.icon ?? "💬"}</span>
                <span className="lbl">{f.label}</span>
                {f.hitCount > 0 && <span className="kbd">{f.hitCount}</span>}
              </Link>
            );
          })}
        </div>
      )}

      <div className="side-foot">
        <div className="user-row">
          <div className="avatar">민</div>
          <div className="meta">
            <div className="name">박민지</div>
            <div className="sub text-muted">{lang === "ko" ? "운영 매니저" : "Operations Manager"}</div>
          </div>
          <Link href="/settings" className="btn icon ghost" aria-label={lang === "ko" ? "설정" : "Settings"}>
            <I.setting size={14} />
          </Link>
        </div>
      </div>

      <style>{`
        .sidebar {
          width: var(--side-w); flex: 0 0 var(--side-w);
          background: var(--bg-side);
          border-right: 1px solid var(--bd-1);
          display: flex; flex-direction: column;
          padding: 8px 8px 4px;
          height: 100%;
        }
        .ws {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 6px 6px 6px; margin: 2px 0 8px;
          border-radius: var(--r-md);
          cursor: pointer;
        }
        .ws:hover { background: var(--bg-hover); }
        .ws-logo {
          width: 28px; height: 28px; flex: 0 0 28px;
          border-radius: 6px;
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          color: white; font-weight: 700; font-size: 11px;
          display: flex; align-items: center; justify-content: center;
          letter-spacing: 0.5px;
        }
        .ws-meta { flex: 1; min-width: 0; }
        .ws-name { font-size: var(--fs-md); font-weight: 600; color: var(--t-1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ws-sub  { font-size: var(--fs-xs); color: var(--t-3); }

        .side-search {
          display: flex; align-items: center; gap: 8px;
          padding: 0 10px;
          height: 30px; margin: 0 2px 14px;
          background: var(--bg);
          border: 1px solid var(--bd-1);
          border-radius: var(--r-sm);
          color: var(--t-3);
        }
        .side-search input {
          flex: 1; border: 0; background: transparent; outline: none;
          font: inherit; font-size: var(--fs-sm); color: var(--t-1);
          min-width: 0;
        }
        .side-search input::placeholder { color: var(--t-4); }

        .side-section { padding: 0 2px 12px; }
        .side-label { padding: 6px 10px 4px; }
        .side-item {
          width: 100%; display: flex; align-items: center; gap: 10px;
          padding: 0 10px; height: var(--row-h);
          border: 0; background: transparent;
          color: var(--t-2); font: inherit; font-size: var(--fs-md);
          border-radius: var(--r-sm); cursor: pointer;
          text-align: left; text-decoration: none;
        }
        .side-item:hover { background: var(--bg-hover); color: var(--t-1); }
        .side-item[data-active="true"] {
          background: var(--bg-active);
          color: var(--t-1); font-weight: 500;
        }
        .side-item .ic { color: var(--t-3); display: flex; }
        .side-item[data-active="true"] .ic { color: var(--acc); }
        .side-item .lbl { flex: 1; }
        .side-item .badge {
          background: var(--bg-mute); color: var(--t-2);
          padding: 0 6px; min-width: 18px; height: 16px;
          border-radius: 999px; font-size: 10px; text-align: center;
          line-height: 16px; font-weight: 500;
        }
        .side-item[data-active="true"] .badge { background: var(--acc-soft); color: var(--acc-text); }
        .side-item .kbd { opacity: 0; }
        .side-item:hover .kbd { opacity: 1; }

        .side-foot { margin-top: auto; padding: 8px 4px 4px; border-top: 1px solid var(--bd-1); }
        .user-row {
          display: flex; align-items: center; gap: 8px;
          padding: 4px 6px; border-radius: var(--r-sm);
          cursor: pointer;
        }
        .user-row:hover { background: var(--bg-hover); }
        .avatar {
          width: 26px; height: 26px; border-radius: 999px;
          background: #fcd34d; color: #78350f;
          font-size: 11px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          flex: 0 0 26px;
        }
        .user-row .meta { flex: 1; min-width: 0; }
        .user-row .name { font-size: var(--fs-md); font-weight: 500; color: var(--t-1); }
        .user-row .sub  { font-size: var(--fs-xs); }
      `}</style>
    </aside>
  );
};
