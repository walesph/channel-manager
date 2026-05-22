"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { I } from "../icons";
import type { Lang } from "@/lib/i18n";

interface TabDef {
  id: string;
  href: string;
  match: string;
  icon: React.ReactNode;
  lbl: string;
  badge?: number;
}

interface TabBarProps {
  lang: Lang;
  badges?: { bookings?: number; messages?: number };
}

export function MobileTabBar({ lang, badges }: TabBarProps) {
  const pathname = usePathname() ?? "";
  const tabs: TabDef[] = [
    { id: "home", href: "/m/dashboard", match: "/m/dashboard", icon: <I.home size={18} />, lbl: lang === "ko" ? "홈" : "Home" },
    { id: "cal", href: "/m/calendar", match: "/m/calendar", icon: <I.cal size={18} />, lbl: lang === "ko" ? "캘린더" : "Cal" },
    { id: "bk", href: "/m/bookings", match: "/m/bookings", icon: <I.inbox size={18} />, lbl: lang === "ko" ? "예약" : "Book", badge: badges?.bookings },
    { id: "msg", href: "/m/messages", match: "/m/messages", icon: <I.msg size={18} />, lbl: lang === "ko" ? "메시지" : "Msg", badge: badges?.messages },
    // Housekeeping replaces the dead `/m/me` tab — operationally far more
    // useful for staff carrying a phone room-to-room.
    { id: "hk", href: "/m/housekeeping", match: "/m/housekeeping", icon: <I.sparkle size={18} />, lbl: lang === "ko" ? "객실" : "Rooms" },
  ];
  return (
    <div className="m-tabbar">
      {tabs.map((b) => (
        <Link key={b.id} href={b.href} className={`m-tab ${pathname.startsWith(b.match) ? "active" : ""}`}>
          <div style={{ position: "relative" }}>
            {b.icon}
            {b.badge && b.badge > 0 ? <span className="tab-badge">{b.badge > 9 ? "9+" : b.badge}</span> : null}
          </div>
          <span>{b.lbl}</span>
        </Link>
      ))}
      <style>{`
        .m-tabbar { position: absolute; bottom: 0; left: 0; right: 0; display: grid; grid-template-columns: repeat(5, 1fr); background: var(--bg-elev); border-top: 1px solid var(--bd-1); padding: 6px 0 14px;}
        .m-tab { background: transparent; border: 0; font: inherit; padding: 6px; display: flex; flex-direction: column; align-items: center; gap: 2px; color: var(--t-3); cursor: pointer; font-size: 10px; text-decoration: none;}
        .m-tab.active { color: var(--acc);}
        .tab-badge { position: absolute; top: -4px; right: -8px; background: var(--bad); color: white; font-size: 9px; min-width: 14px; height: 14px; border-radius: 999px; display: flex; align-items: center; justify-content: center; padding: 0 4px;}
      `}</style>
    </div>
  );
}
