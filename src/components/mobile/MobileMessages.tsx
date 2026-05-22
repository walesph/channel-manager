"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { I } from "../icons";
import { channelById, type Lang } from "@/lib/i18n";
import type { MessageRow, SavedReplyRow, ThreadRow } from "@/lib/queries";
import { draftReplyForThread, sendMessage } from "@/lib/actions";
import { MobileTabBar } from "./MobileTabBar";

function formatHm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface Props {
  lang: Lang;
  threads: ThreadRow[];
  savedReplies: SavedReplyRow[];
}

export function MobileMessages({ lang, threads, savedReplies }: Props) {
  const router = useRouter();
  const [optimisticThreads, addOptimisticMessage] = useOptimistic(
    threads,
    (state, patch: { threadId: string; message: MessageRow }) =>
      state.map((t) =>
        t.id === patch.threadId
          ? { ...t, messages: [...t.messages, patch.message], lastMessageAt: patch.message.createdAt, unread: 0, lastSnippet: patch.message.body }
          : t,
      ),
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showReplies, setShowReplies] = useState(false);
  const [aiPending, setAiPending] = useState(false);
  const [aiMeta, setAiMeta] = useState<string | null>(null);

  const opened = openId ? optimisticThreads.find((t) => t.id === openId) : null;

  const submit = () => {
    if (!opened || pending || !draft.trim()) return;
    setError(null);
    const body = draft;
    startTransition(async () => {
      const optimisticMsg: MessageRow = {
        id: `optimistic-${Date.now()}`,
        sender: "host",
        body,
        createdAt: new Date().toISOString(),
      };
      addOptimisticMessage({ threadId: opened.id, message: optimisticMsg });
      setDraft("");
      const r = await sendMessage(opened.id, body);
      if (!r.ok) {
        setError(r.error);
        setDraft(body);
        return;
      }
      router.refresh();
    });
  };

  const onAiDraft = async (tone: "friendly" | "formal" | "concise") => {
    if (!opened || aiPending) return;
    setError(null);
    setAiPending(true);
    setAiMeta(null);
    try {
      const r = await draftReplyForThread({ threadId: opened.id, tone });
      if ("ok" in r && r.ok && r.draft) {
        setDraft(r.draft);
        const provLabel = r.provider === "mock" ? "(mock)" : r.provider;
        setAiMeta(`${provLabel} · ${r.latencyMs}ms`);
      } else {
        setError(("error" in r && r.error) ? r.error : "draft failed");
      }
    } finally {
      setAiPending(false);
    }
  };

  return (
    <div className="m-screen" style={{ padding: 0 }}>
      <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--bd-1)", background: "var(--bg-elev)" }}>
        <div className="m-title" style={{ fontSize: 20 }}>{lang === "ko" ? "메시지" : "Messages"}</div>
        <div className="text-muted" style={{ fontSize: 11 }}>
          {threads.length}{lang === "ko" ? "개 스레드" : " threads"} · {threads.reduce((s, t) => s + t.unread, 0)}{lang === "ko" ? "개 미응답" : " unread"}
        </div>
      </div>

      <div className="m-msg-list">
        {optimisticThreads.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--t-3)", fontSize: 13 }}>
            {lang === "ko" ? "메시지가 없습니다." : "No messages."}
          </div>
        ) : (
          optimisticThreads.map((th) => {
            const c = channelById(th.channel)!;
            return (
              <button key={th.id} className="m-thread-row" onClick={() => setOpenId(th.id)}>
                <div className="m-th-av">
                  <span style={{ fontSize: 22 }}>{th.guestFlag}</span>
                  <span className={`m-th-badge ${c.cls}`} />
                </div>
                <div className="m-th-body">
                  <div className="m-th-top">
                    <span className="m-th-name">
                      {th.slaTier && <span className={`sla-dot sla-${th.slaTier}`} />}
                      {th.guestName}
                    </span>
                    <span className="num text-muted" style={{ fontSize: 11 }}>{formatHm(th.lastMessageAt)}</span>
                  </div>
                  <div className="m-th-mid">
                    <span className="mini-ch"><span className={`dot ${c.cls}`} />{c.name}</span>
                    {th.slaTier && (
                      <span className={`sla-pill sla-${th.slaTier}`}>
                        {th.awaitingHours < 1
                          ? `${Math.max(1, Math.round(th.awaitingHours * 60))}m`
                          : `${Math.round(th.awaitingHours)}h`}
                      </span>
                    )}
                  </div>
                  <div className="m-th-bot">
                    <span className="m-snippet">{th.lastSnippet}</span>
                    {th.unread > 0 && <span className="m-unread num">{th.unread}</span>}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {opened && (
        <div className="m-sheet">
          <div className="m-sheet-head">
            <button className="btn ghost" onClick={() => setOpenId(null)} style={{ height: 36 }}>
              <I.chevL size={16} /> {lang === "ko" ? "뒤로" : "Back"}
            </button>
            <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{opened.guestName}</div>
              <div className="text-muted" style={{ fontSize: 10 }}>
                <span className="mini-ch"><span className={`dot ${channelById(opened.channel)?.cls}`} />{channelById(opened.channel)?.name}</span>
                {opened.bookingRef && <> · {opened.bookingRef}</>}
              </div>
            </div>
            <div style={{ width: 60 }} />
          </div>

          <div className="m-conv">
            {opened.messages.map((m) =>
              m.sender === "system" ? (
                <div key={m.id} className="m-sys">{m.body}</div>
              ) : (
                <div key={m.id} className={`m-bubble ${m.sender === "guest" ? "them" : "me"}`}>
                  <div>{m.body}</div>
                  <div className="m-bub-time">{formatHm(m.createdAt)}</div>
                </div>
              ),
            )}
          </div>

          {showReplies && savedReplies.length > 0 && (
            <div className="m-saved">
              {savedReplies.map((r) => (
                <button
                  key={r.id}
                  className="m-saved-chip"
                  onClick={() => {
                    setDraft((d) => (d ? `${d}\n\n${r.body}` : r.body));
                    setShowReplies(false);
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}

          {error && <div className="m-err" style={{ margin: "0 12px 8px" }}>{error}</div>}

          <div className="m-ai-bar">
            <I.sparkle size={11} />
            <span style={{ fontSize: 11, color: "var(--t-3)" }}>{lang === "ko" ? "AI 작성:" : "AI:"}</span>
            <button className="m-ai-chip" onClick={() => onAiDraft("friendly")} disabled={aiPending}>
              {lang === "ko" ? "친근" : "Friendly"}
            </button>
            <button className="m-ai-chip" onClick={() => onAiDraft("formal")} disabled={aiPending}>
              {lang === "ko" ? "정중" : "Formal"}
            </button>
            <button className="m-ai-chip" onClick={() => onAiDraft("concise")} disabled={aiPending}>
              {lang === "ko" ? "간결" : "Concise"}
            </button>
            {aiMeta && <span className="text-muted" style={{ fontSize: 9, marginLeft: 4 }}>{aiMeta}</span>}
          </div>

          <div className="m-input-bar">
            <button
              className="btn ghost icon"
              onClick={() => setShowReplies((v) => !v)}
              aria-label="saved"
            >
              <I.sparkle size={16} />
            </button>
            <textarea
              className="m-input"
              placeholder={lang === "ko" ? "답장…" : "Reply…"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={1}
              disabled={pending}
            />
            <button className="btn primary" onClick={submit} disabled={pending || !draft.trim()} style={{ height: 36 }}>
              {pending ? "…" : <I.send size={14} />}
            </button>
          </div>
        </div>
      )}

      <MobileTabBar lang={lang} badges={{ messages: threads.reduce((s, t) => s + t.unread, 0) }} />

      <style>{`
        .m-screen { background: var(--bg-1); height: 100vh; overflow: hidden; display: flex; flex-direction: column; position: relative;}
        .m-title { font-size: 22px; font-weight: 600; color: var(--t-1); letter-spacing: -0.01em;}

        .m-msg-list { flex: 1; overflow: auto; padding-bottom: 80px;}
        .m-thread-row {
          width: 100%; text-align: left; border: 0; background: transparent;
          padding: 12px 14px; border-bottom: 1px solid var(--bd-1);
          font: inherit; cursor: pointer;
          display: flex; gap: 10px; align-items: flex-start;
        }
        .m-thread-row:active { background: var(--bg-hover);}
        .m-th-av { position: relative; flex: 0 0 36px;}
        .m-th-badge { position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; border-radius: 4px; border: 2px solid var(--bg-1);}
        .m-th-body { flex: 1; min-width: 0;}
        .m-th-top { display: flex; justify-content: space-between; align-items: center;}
        .m-th-name { font-weight: 600; font-size: 14px; color: var(--t-1);}
        .m-th-mid { margin: 2px 0;}
        .m-th-bot { display: flex; justify-content: space-between; align-items: center; gap: 8px;}
        .m-snippet { font-size: 12px; color: var(--t-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
        .m-unread { background: var(--acc); color: white; padding: 0 6px; min-width: 18px; height: 18px; line-height: 18px; border-radius: 999px; font-size: 10px; font-weight: 600; text-align: center;}
        .mini-ch { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--t-2);}
        .mini-ch .dot { width: 6px; height: 6px; border-radius: 1px; flex: 0 0 6px;}

        .m-sheet { position: fixed; inset: 0; background: var(--bg); z-index: 200; display: flex; flex-direction: column;}
        .m-sheet-head { display: flex; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--bd-1); background: var(--bg-elev);}

        .m-conv { flex: 1; overflow: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;}
        .m-sys { text-align: center; font-size: 11px; color: var(--t-3); padding: 4px 0;}
        .m-bubble { max-width: 78%; padding: 8px 12px; border-radius: 14px; font-size: 14px; line-height: 1.4; align-self: flex-start;}
        .m-bubble.them { background: var(--bg-mute); color: var(--t-1); border-bottom-left-radius: 4px;}
        .m-bubble.me { background: var(--acc); color: white; align-self: flex-end; border-bottom-right-radius: 4px;}
        .m-bub-time { font-size: 9px; margin-top: 4px; opacity: 0.7;}

        .m-saved { display: flex; gap: 6px; padding: 6px 12px; overflow-x: auto; background: var(--acc-soft); border-top: 1px solid var(--bd-1);}
        .m-saved-chip { border: 1px solid var(--acc-bd); background: var(--bg); color: var(--acc-text); font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 999px; cursor: pointer; white-space: nowrap;}

        .m-input-bar { display: flex; gap: 6px; align-items: flex-end; padding: 8px 12px 12px; border-top: 1px solid var(--bd-1); background: var(--bg-elev);}
        .m-input { flex: 1; min-height: 36px; max-height: 120px; resize: none; border: 1px solid var(--bd-2); border-radius: var(--r-sm); padding: 8px 10px; font: inherit; font-size: 14px; outline: none; color: var(--t-1); background: var(--bg);}
        .m-input:focus { border-color: var(--acc);}
        .m-err { font-size: 12px; color: var(--bad); background: var(--bad-soft); padding: 6px 10px; border-radius: var(--r-sm);}
        .sla-dot { display: inline-block; width: 6px; height: 6px; border-radius: 999px; margin-right: 5px; vertical-align: middle; }
        .sla-dot.sla-fresh   { background: var(--ok); }
        .sla-dot.sla-warning { background: var(--warn); }
        .sla-dot.sla-stale   { background: var(--bad); animation: m-pulse 1.4s ease-in-out infinite; }
        .sla-pill {
          margin-left: 4px; padding: 1px 5px; border-radius: 999px;
          font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
        }
        .sla-pill.sla-fresh   { background: var(--ok-soft); color: var(--ok); }
        .sla-pill.sla-warning { background: var(--warn-soft); color: var(--warn); }
        .sla-pill.sla-stale   { background: var(--bad-soft); color: var(--bad); }
        @keyframes m-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.25); }
        }
        .m-ai-bar { display: flex; align-items: center; gap: 4px; padding: 6px 12px; border-top: 1px solid var(--bd-1); background: var(--bg-1); overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .m-ai-bar::-webkit-scrollbar { display: none; }
        .m-ai-chip {
          flex: 0 0 auto; border: 1px solid var(--bd-1); background: var(--bg-elev);
          padding: 4px 10px; border-radius: 999px; font: inherit; font-size: 11px; color: var(--t-1); cursor: pointer;
          white-space: nowrap;
        }
        .m-ai-chip:disabled { opacity: 0.6; }
        .m-ai-chip:active { background: var(--acc-soft); }
      `}</style>
    </div>
  );
}
