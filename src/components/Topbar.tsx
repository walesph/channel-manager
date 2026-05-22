"use client";

import { Fragment, type ReactNode } from "react";
import { I } from "./icons";
import { CHANNELS, type ChannelDef, type Lang } from "@/lib/i18n";
import { MaybeUserButton } from "./MaybeUserButton";
import { NotificationsBell } from "./NotificationsBell";
import type { ActivityItem } from "@/lib/queries";

interface ChannelStripProps {
  channels?: ChannelDef[];
  lang?: Lang;
}

export const ChannelStrip = ({ channels = CHANNELS }: ChannelStripProps) => (
  <div className="ch-strip">
    {channels.map((c) => (
      <div key={c.id} className="ch-pill" data-status={c.status}>
        <span className={`dot ${c.cls}`} />
        <span className="nm">{c.name}</span>
        <span className="st">
          {c.status === "synced" && <I.check size={11} />}
          {c.status === "syncing" && <I.refresh size={11} className="spin" />}
          {c.status === "delayed" && <I.warn size={11} />}
          {c.status === "error" && <I.warn size={11} />}
        </span>
      </div>
    ))}
    <style>{`
      .ch-strip { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .ch-pill {
        display: inline-flex; align-items: center; gap: 6px;
        height: 24px; padding: 0 8px;
        background: var(--bg);
        border: 1px solid var(--bd-1);
        border-radius: var(--r-sm);
        font-size: var(--fs-xs); color: var(--t-2);
      }
      .ch-pill .dot { width: 7px; height: 7px; border-radius: 2px; flex: 0 0 7px; }
      .ch-pill .nm { font-weight: 500; color: var(--t-1); }
      .ch-pill .st { color: var(--ok); display: flex; }
      .ch-pill[data-status="syncing"] .st { color: var(--info); }
      .ch-pill[data-status="delayed"] .st { color: var(--warn); }
      .ch-pill[data-status="error"]   .st { color: var(--bad); }
    `}</style>
  </div>
);

interface TopbarProps {
  title: string;
  sub?: string;
  breadcrumb?: string[];
  actions?: ReactNode;
  lang?: Lang;
  onLang?: () => void;
  dark?: boolean;
  onDark?: () => void;
  showSync?: boolean;
  activity?: ActivityItem[];
}

export const Topbar = ({
  title,
  sub,
  breadcrumb,
  actions,
  lang = "ko",
  onLang,
  dark,
  onDark,
  showSync = true,
  activity = [],
}: TopbarProps) => (
  <header className="topbar">
    <div className="tb-row">
      <div className="tb-left">
        {breadcrumb ? (
          <div className="bcr">
            {breadcrumb.map((b, i) => (
              <Fragment key={i}>
                <span className={i === breadcrumb.length - 1 ? "cur" : ""}>{b}</span>
                {i < breadcrumb.length - 1 && <I.chevR size={12} className="sep" />}
              </Fragment>
            ))}
          </div>
        ) : null}
        <div className="title-row">
          <h1 className="title">{title}</h1>
          {sub ? <span className="sub">{sub}</span> : null}
        </div>
      </div>
      <div className="tb-right">
        {actions}
        <div className="tb-divider" />
        <button className="btn ghost icon" aria-label="theme" onClick={onDark}>
          {dark ? <I.sun size={15} /> : <I.moon size={15} />}
        </button>
        <button className="btn ghost lang" onClick={onLang} title="Cycle language (KO → EN → JA → ZH)">
          <I.globe size={13} />
          <span>{lang.toUpperCase()}</span>
        </button>
        <NotificationsBell activity={activity} lang={lang} />
        <MaybeUserButton />
      </div>
    </div>

    {showSync && (
      <div className="tb-sync">
        <ChannelStrip lang={lang} />
        <div className="sync-meta">
          <span className="text-muted" style={{ fontSize: 11 }}>
            {lang === "ko" ? "마지막 동기화" : "Last sync"} <span className="mono">14:02:08</span>
          </span>
          <button className="btn sm ghost">
            <I.refresh size={12} /> {lang === "ko" ? "지금 동기화" : "Sync now"}
          </button>
        </div>
      </div>
    )}

    <style>{`
      .topbar { background: var(--bg); border-bottom: 1px solid var(--bd-1); }
      .tb-row {
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 24px 12px;
        gap: 16px;
      }
      .tb-left { min-width: 0; }
      .bcr { display: flex; align-items: center; gap: 6px; font-size: var(--fs-xs); color: var(--t-3); margin-bottom: 6px;}
      .bcr .cur { color: var(--t-2); font-weight: 500; }
      .bcr .sep { color: var(--t-4); }
      .title-row { display: flex; align-items: baseline; gap: 12px; }
      .title { margin: 0; font-size: var(--fs-3xl); font-weight: 600; letter-spacing: -0.01em; color: var(--t-1); }
      .sub { font-size: var(--fs-md); color: var(--t-3); }
      .tb-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
      .tb-divider { width: 1px; height: 18px; background: var(--bd-2); margin: 0 4px; }
      .tb-right .lang { padding: 0 8px; gap: 4px; height: 28px; font-size: var(--fs-xs); color: var(--t-2); font-weight: 500; }

      .tb-sync {
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px 24px 10px;
        gap: 12px;
      }
      .sync-meta { display: flex; align-items: center; gap: 8px; }
    `}</style>
  </header>
);
