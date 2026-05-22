"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { I } from "./icons";
import { fetchCommands } from "@/lib/actions";
import type { CommandItem } from "@/lib/queries";
import type { Lang } from "@/lib/i18n";

interface Props {
  lang: Lang;
}

export function CommandPalette({ lang }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CommandItem[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Global ⌘K / Ctrl+K to toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Search debounced — fetch on query change
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      startTransition(async () => {
        const next = await fetchCommands(query);
        setItems(next);
        setHighlight(0);
      });
    }, 80);
    return () => clearTimeout(t);
  }, [query, open]);

  if (!open) return null;

  const choose = (item: CommandItem) => {
    setOpen(false);
    router.push(item.href);
  };

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(items.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter" && items[highlight]) {
      e.preventDefault();
      choose(items[highlight]);
    }
  };

  const KIND_LABEL: Record<CommandItem["kind"], { ko: string; en: string; color: string }> = {
    page: { ko: "페이지", en: "Page", color: "#4f46e5" },
    booking: { ko: "예약", en: "Booking", color: "#16a34a" },
    thread: { ko: "메시지", en: "Thread", color: "#0284c7" },
    channel: { ko: "채널", en: "Channel", color: "#ea580c" },
  };

  return (
    <div className="cmd-bg" onClick={() => setOpen(false)}>
      <div className="cmd-modal" onClick={(e) => e.stopPropagation()} onKeyDown={onListKey}>
        <div className="cmd-input-row">
          <I.search size={14} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={lang === "ko" ? "검색이나 명령 입력…" : "Search or type a command…"}
            spellCheck={false}
          />
          {pending && <span className="text-muted" style={{ fontSize: 11 }}>…</span>}
          <span className="kbd-cmd">esc</span>
        </div>
        <div className="cmd-list">
          {items.length === 0 ? (
            <div className="cmd-empty">{lang === "ko" ? "결과 없음" : "No results"}</div>
          ) : (
            items.map((item, i) => {
              const k = KIND_LABEL[item.kind];
              return (
                <button
                  key={item.id}
                  className={`cmd-item ${i === highlight ? "active" : ""}`}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => choose(item)}
                >
                  <span className="cmd-kind" style={{ background: `${k.color}22`, color: k.color }}>{lang === "ko" ? k.ko : k.en}</span>
                  <div className="cmd-body">
                    <div className="cmd-label">{item.label}</div>
                    {item.sub && <div className="cmd-sub">{item.sub}</div>}
                  </div>
                  {item.hint && <span className="kbd-cmd">{item.hint}</span>}
                </button>
              );
            })
          )}
        </div>
        <div className="cmd-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> {lang === "ko" ? "이동" : "navigate"}</span>
          <span><kbd>↵</kbd> {lang === "ko" ? "선택" : "select"}</span>
          <span><kbd>esc</kbd> {lang === "ko" ? "닫기" : "close"}</span>
        </div>
        <style>{`
          .cmd-bg { position: fixed; inset: 0; background: rgba(15,15,20,0.4); z-index: 200; display: flex; align-items: flex-start; justify-content: center; padding-top: 14vh; }
          .cmd-modal { width: 560px; max-width: calc(100vw - 32px); background: var(--bg-elev); border: 1px solid var(--bd-2); border-radius: var(--r-lg); box-shadow: var(--shadow-pop); overflow: hidden; display: flex; flex-direction: column; max-height: 70vh; }
          .cmd-input-row { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--bd-1); color: var(--t-3); }
          .cmd-input-row input { flex: 1; border: 0; background: transparent; outline: none; font: inherit; font-size: 14px; color: var(--t-1); }
          .cmd-input-row input::placeholder { color: var(--t-4); }
          .kbd-cmd { font-family: var(--font-mono); font-size: 10px; padding: 2px 6px; background: var(--bg-mute); border: 1px solid var(--bd-2); border-bottom-width: 2px; border-radius: 4px; color: var(--t-3); }
          .cmd-list { overflow: auto; flex: 1; }
          .cmd-empty { padding: 32px; text-align: center; color: var(--t-3); font-size: 12px; }
          .cmd-item { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 14px; border: 0; background: transparent; font: inherit; cursor: pointer; text-align: left; }
          .cmd-item.active { background: var(--bg-hover); }
          .cmd-kind { font-size: 10px; padding: 2px 7px; border-radius: 999px; font-weight: 600; flex: 0 0 auto; }
          .cmd-body { flex: 1; min-width: 0; }
          .cmd-label { font-size: 13px; font-weight: 500; color: var(--t-1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .cmd-sub { font-size: 11px; color: var(--t-3); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .cmd-foot { display: flex; gap: 14px; padding: 8px 14px; border-top: 1px solid var(--bd-1); background: var(--bg-1); font-size: 11px; color: var(--t-3); }
          .cmd-foot kbd { font-family: var(--font-mono); font-size: 10px; padding: 1px 4px; background: var(--bg); border: 1px solid var(--bd-2); border-radius: 3px; color: var(--t-2); margin-right: 2px; }
        `}</style>
      </div>
    </div>
  );
}
