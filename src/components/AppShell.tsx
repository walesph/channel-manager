"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { CommandPalette } from "./CommandPalette";
import { useApp } from "@/lib/app-context";
import { STR, type Lang } from "@/lib/i18n";
import type { ActivityItem, SavedFilterRow } from "@/lib/queries";

type RouteMeta = {
  title: (l: Lang) => string;
  sub?: (l: Lang) => string;
  showSync?: boolean;
};

const ROUTES: Record<string, RouteMeta> = {
  "/": {
    title: (l) => STR[l].nav.dashboard,
    sub: (l) => (l === "ko" ? "오늘 운영 현황" : "Today at a glance"),
  },
  "/calendar": {
    title: (l) => STR[l].nav.calendar,
    sub: (l) => (l === "ko" ? "재고·요금·예약" : "Inventory · rates · bookings"),
  },
  "/bookings": {
    title: (l) => STR[l].nav.bookings,
    sub: (l) => (l === "ko" ? "통합 예약 인박스" : "Unified inbox"),
  },
  "/messages": {
    title: (l) => STR[l].nav.messages,
    sub: (l) => (l === "ko" ? "전 채널 통합 인박스" : "All channels"),
    showSync: false,
  },
  "/channels": {
    title: (l) => STR[l].nav.channels,
    sub: (l) => (l === "ko" ? "OTA 연동 및 동기화 상태" : "OTA connections"),
  },
  "/rooms": {
    title: (l) => STR[l].nav.rooms,
    sub: (l) => (l === "ko" ? "객실 타입 · 요금제 · 정책" : "Room types · rate plans · policies"),
  },
  "/revenue": {
    title: (l) => STR[l].nav.revenue,
    sub: (l) => (l === "ko" ? "채널 P&L · 분석" : "Channel P&L · analytics"),
  },
};

function metaFor(pathname: string): RouteMeta {
  if (ROUTES[pathname]) return ROUTES[pathname];
  const match = Object.keys(ROUTES).find((k) => k !== "/" && pathname.startsWith(k));
  return match ? ROUTES[match] : ROUTES["/"];
}

export const AppShell = ({ children, activity = [], savedFilters = [] }: { children: ReactNode; activity?: ActivityItem[]; savedFilters?: SavedFilterRow[] }) => {
  const { lang, dark, toggleLang, toggleDark } = useApp();
  const pathname = usePathname() ?? "/";
  const meta = metaFor(pathname);
  const t = STR[lang];

  return (
    <div className={`shell ${dark ? "theme-dark" : ""}`}>
      <Sidebar lang={lang} savedFilters={savedFilters} />
      <main className="main">
        <Topbar
          title={meta.title(lang)}
          sub={meta.sub?.(lang)}
          breadcrumb={[t.workspace, meta.title(lang)]}
          lang={lang}
          onLang={toggleLang}
          dark={dark}
          onDark={toggleDark}
          showSync={meta.showSync !== false}
          activity={activity}
        />
        <div className="main-body">{children}</div>
      </main>
      <CommandPalette lang={lang} />

      <style>{`
        .shell {
          display: flex;
          height: 100vh;
          width: 100%;
          background: var(--bg);
          color: var(--t-1);
        }
        .main {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .main-body {
          flex: 1;
          overflow: auto;
          background: var(--bg-1);
        }
      `}</style>
    </div>
  );
};
