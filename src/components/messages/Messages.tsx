"use client";

import { useEffect, useOptimistic, useState, useTransition, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { I } from "../icons";
import { CHANNELS, channelById, type ChannelId, type Lang } from "@/lib/i18n";
import type { MessageRow, SavedReplyRow, ThreadRow } from "@/lib/queries";
import { createSavedFilter, draftReplyForThread, sendMessage } from "@/lib/actions";

function formatHm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatMd(iso: string | null): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

interface MessagesProps {
  lang?: Lang;
  threads: ThreadRow[];
  savedReplies: SavedReplyRow[];
}

export const Messages = ({ lang = "ko", threads, savedReplies }: MessagesProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialFromQuery = searchParams?.get("thread") ?? null;
  const [optimisticThreads, addOptimisticMessage] = useOptimistic(
    threads,
    (state, patch: { threadId: string; message: MessageRow }) =>
      state.map((t) =>
        t.id === patch.threadId
          ? { ...t, messages: [...t.messages, patch.message], lastMessageAt: patch.message.createdAt, unread: 0, lastSnippet: patch.message.body }
          : t,
      ),
  );
  const initialId =
    (initialFromQuery && threads.find((t) => t.id === initialFromQuery)?.id) ?? threads[0]?.id ?? null;
  const [selId, setSelId] = useState<string | null>(initialId);

  // Re-sync selection if the URL query changes after mount (e.g. user nav from /bookings)
  useEffect(() => {
    if (initialFromQuery && threads.some((t) => t.id === initialFromQuery)) {
      setSelId(initialFromQuery);
    }
  }, [initialFromQuery, threads]);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // `?tab=...` URL param picks the initial tab — used by saved-filter
  // sidebar links to drop the user straight into the right view.
  const tabFromUrl = (() => {
    const v = searchParams?.get("tab");
    return v === "unread" || v === "needs_reply" || v === "inbox" ? v : null;
  })();
  const initialChannel = (() => {
    const v = searchParams?.get("channel");
    if (!v) return "all";
    const valid = CHANNELS.find((c) => c.id === v);
    return valid ? (valid.id as ChannelId) : "all";
  })();
  const initialQuery = searchParams?.get("q") ?? "";
  const [tab, setTab] = useState<"inbox" | "unread" | "needs_reply">(tabFromUrl ?? "inbox");
  const [query, setQuery] = useState(initialQuery);
  const [channelFilter, setChannelFilter] = useState<ChannelId | "all">(initialChannel);

  const [aiPending, setAiPending] = useState(false);
  const [aiTone, setAiTone] = useState<"friendly" | "formal" | "concise" | null>(null);
  const [aiMeta, setAiMeta] = useState<string | null>(null);

  if (threads.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "var(--t-3)" }}>
        {lang === "ko" ? "메시지가 없습니다." : "No messages yet."}
      </div>
    );
  }

  const cur = optimisticThreads.find((t) => t.id === selId) ?? optimisticThreads[0];

  const onAiDraft = async (tone: "friendly" | "formal" | "concise") => {
    if (!cur || aiPending) return;
    setAiPending(true);
    setAiTone(tone);
    setAiMeta(null);
    try {
      const r = await draftReplyForThread({ threadId: cur.id, tone });
      if ("ok" in r && r.ok && r.draft) {
        setDraft(r.draft);
        const provLabel = r.provider === "mock" ? "(mock)" : r.provider;
        setAiMeta(`${provLabel} · ${r.latencyMs}ms${r.tokens ? ` · ${r.tokens.input}+${r.tokens.output}t` : ""}`);
      } else {
        setSendError(("error" in r && r.error) ? r.error : "draft failed");
      }
    } finally {
      setAiPending(false);
      setAiTone(null);
    }
  };
  const curCh = channelById(cur.channel)!;
  const totalUnread = optimisticThreads.reduce((s, t) => s + t.unread, 0);
  const totalNeedsReply = optimisticThreads.filter((t) => t.slaTier !== null).length;
  const trimmedQuery = query.trim().toLowerCase();
  const filteredThreadsRaw = optimisticThreads.filter((t) => {
    if (tab === "unread" && t.unread === 0) return false;
    if (tab === "needs_reply" && t.slaTier === null) return false;
    if (channelFilter !== "all" && t.channel !== channelFilter) return false;
    if (!trimmedQuery) return true;
    return (
      t.guestName.toLowerCase().includes(trimmedQuery) ||
      t.lastSnippet.toLowerCase().includes(trimmedQuery) ||
      t.messages.some((m) => m.body.toLowerCase().includes(trimmedQuery))
    );
  });
  // In needs_reply mode, sort by SLA urgency (stale > warning > fresh, then by hours desc)
  const filteredThreads = tab === "needs_reply"
    ? [...filteredThreadsRaw].sort((a, b) => {
        const rank = { stale: 0, warning: 1, fresh: 2 } as const;
        const ra = a.slaTier ? rank[a.slaTier] : 3;
        const rb = b.slaTier ? rank[b.slaTier] : 3;
        if (ra !== rb) return ra - rb;
        return b.awaitingHours - a.awaitingHours;
      })
    : filteredThreadsRaw;

  const submit = () => {
    if (pending || !draft.trim()) return;
    setSendError(null);
    const body = draft;
    startTransition(async () => {
      const optimisticMsg: MessageRow = {
        id: `optimistic-${Date.now()}`,
        sender: "host",
        body,
        createdAt: new Date().toISOString(),
      };
      addOptimisticMessage({ threadId: cur.id, message: optimisticMsg });
      setDraft("");
      const r = await sendMessage(cur.id, body);
      if (!r.ok) {
        setSendError(r.error);
        setDraft(body); // restore so user can retry
        return;
      }
      router.refresh();
    });
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="msg-wrap">
      <div className="msg-list">
        <div className="ml-head">
          <div className="ml-tabs">
            <button className={`tab ${tab === "inbox" ? "active" : ""}`} onClick={() => setTab("inbox")}>
              {lang === "ko" ? "받은 편지함" : "Inbox"} <span className="cnt num">{optimisticThreads.length}</span>
            </button>
            <button className={`tab ${tab === "unread" ? "active" : ""}`} onClick={() => setTab("unread")}>
              {lang === "ko" ? "미응답" : "Unread"} <span className="cnt num">{totalUnread}</span>
            </button>
            <button className={`tab ${tab === "needs_reply" ? "active" : ""}`} onClick={() => setTab("needs_reply")} title={lang === "ko" ? "답장 필요한 게스트 메시지" : "Guest messages awaiting your reply"}>
              {lang === "ko" ? "답장 대기" : "Needs reply"} <span className="cnt num">{totalNeedsReply}</span>
            </button>
          </div>
          <div className="search-bar" style={{ margin: "8px 12px 4px", width: "auto" }}>
            <I.search size={13} />
            <input
              placeholder={lang === "ko" ? "이름 / 메시지 본문 검색…" : "Name / message body…"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                className="btn ghost icon"
                style={{ width: 18, height: 18 }}
                onClick={() => setQuery("")}
                aria-label="clear"
              >
                <I.close size={11} />
              </button>
            )}
          </div>
          <div style={{ padding: "0 12px 8px", display: "flex", gap: 6, alignItems: "center" }}>
            <select
              className="input"
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value as ChannelId | "all")}
              style={{ flex: 1, height: 28, fontSize: 12 }}
            >
              <option value="all">{lang === "ko" ? "모든 채널" : "All channels"}</option>
              {CHANNELS.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {(tab !== "inbox" || channelFilter !== "all" || query.trim()) && (
              <button
                className="btn xs ghost"
                style={{ height: 28 }}
                title={lang === "ko" ? "현재 필터 저장" : "Save current filter"}
                onClick={async () => {
                  const label = prompt(lang === "ko" ? "필터 이름:" : "Filter name:");
                  if (!label) return;
                  const params: Record<string, string> = {};
                  if (query.trim()) params.q = query.trim();
                  if (channelFilter !== "all") params.channel = channelFilter;
                  if (tab !== "inbox") params.tab = tab;
                  const r = await createSavedFilter({ scope: "messages", label, params });
                  if (!("ok" in r) || !r.ok) {
                    alert("error" in r ? r.error : "failed");
                    return;
                  }
                  router.refresh();
                }}
              >
                <I.plus size={10} />
              </button>
            )}
          </div>
        </div>
        <div className="thread-list">
          {filteredThreads.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--t-3)", fontSize: 12 }}>
              {lang === "ko" ? "조건에 맞는 메시지가 없습니다." : "No threads match the filter."}
            </div>
          )}
          {filteredThreads.map((th) => {
            const c = channelById(th.channel)!;
            const slaText = th.slaTier
              ? th.awaitingHours < 1
                ? `${Math.max(1, Math.round(th.awaitingHours * 60))}m`
                : `${Math.round(th.awaitingHours)}h`
              : null;
            return (
              <button key={th.id} className={`thread ${selId === th.id ? "active" : ""}`} onClick={() => setSelId(th.id)}>
                <div className="th-av">
                  <span className="flag" style={{ fontSize: 22 }}>{th.guestFlag}</span>
                  <span className={`ch-badge ${c.cls}`} />
                </div>
                <div className="th-body">
                  <div className="th-top">
                    <span className="nm">
                      {th.slaTier && <span className={`sla-dot sla-${th.slaTier}`} title={lang === "ko" ? `${slaText} 답장 대기` : `awaiting reply ${slaText}`} />}
                      {th.guestName}
                    </span>
                    <span className="tm text-muted num">{formatHm(th.lastMessageAt)}</span>
                  </div>
                  <div className="th-mid">
                    <span className="mini-ch"><span className={`dot ${c.cls}`} />{c.name}</span>
                    {slaText && (
                      <span className={`sla-pill sla-${th.slaTier}`}>
                        {lang === "ko" ? "답장 대기" : "awaiting"} {slaText}
                      </span>
                    )}
                  </div>
                  <div className="th-last">
                    <span className="snippet">{th.lastSnippet}</span>
                    {th.unread > 0 && <span className="unread num">{th.unread}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="msg-conv">
        <div className="conv-head">
          <div className="ch-info">
            <span className="flag" style={{ fontSize: 18 }}>{cur.guestFlag}</span>
            <div>
              <div className="ch-name">{cur.guestName}</div>
              <div className="ch-sub mini-ch">
                <span className={`dot ${curCh.cls}`} />{curCh.name}
                {cur.bookingRef && <> · {cur.bookingRef}</>}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn sm ghost"><I.calCheck size={12} /> {lang === "ko" ? "예약 보기" : "View booking"}</button>
            <button className="btn sm ghost"><I.user size={12} /> {lang === "ko" ? "게스트 정보" : "Guest"}</button>
            <button className="btn ghost icon sm"><I.more size={12} /></button>
          </div>
        </div>

        <div className="conv-body">
          <div className="day-divider"><span>{lang === "ko" ? "오늘" : "Today"}</span></div>
          {cur.messages.map((m) =>
            m.sender === "system" ? (
              <div key={m.id} className="sys-msg">{m.body}</div>
            ) : (
              <div key={m.id} className={`bubble ${m.sender === "guest" ? "them" : "me"}`}>
                <div className="bub-text">{m.body}</div>
                <div className="bub-time text-muted">{formatHm(m.createdAt)}</div>
              </div>
            )
          )}
        </div>

        <div className="conv-input">
          <div className="ai-suggest">
            <I.sparkle size={12} />
            <span style={{ fontSize: 12, color: "var(--t-2)" }}>{lang === "ko" ? "AI 작성:" : "AI draft:"}</span>
            <button
              className="ai-chip"
              onClick={() => onAiDraft("friendly")}
              disabled={aiPending}
              title={lang === "ko" ? "친근한 톤으로 자동 작성" : "Friendly tone draft"}
            >
              {aiPending && aiTone === "friendly" ? "…" : lang === "ko" ? "친근하게" : "Friendly"}
            </button>
            <button
              className="ai-chip"
              onClick={() => onAiDraft("formal")}
              disabled={aiPending}
              title={lang === "ko" ? "정중한 톤" : "Formal tone"}
            >
              {aiPending && aiTone === "formal" ? "…" : lang === "ko" ? "정중하게" : "Formal"}
            </button>
            <button
              className="ai-chip"
              onClick={() => onAiDraft("concise")}
              disabled={aiPending}
              title={lang === "ko" ? "간결하게" : "Concise tone"}
            >
              {aiPending && aiTone === "concise" ? "…" : lang === "ko" ? "간결하게" : "Concise"}
            </button>
            {aiMeta && (
              <span className="text-muted" style={{ fontSize: 10, marginLeft: 6 }}>
                {aiMeta}
              </span>
            )}
          </div>
          {sendError && <div className="send-err">{sendError}</div>}
          <div className="input-row">
            <button className="btn ghost icon"><I.paperclip size={14} /></button>
            <textarea
              className="msg-input"
              placeholder={lang === "ko" ? "답장 입력… (⌘+Enter 전송)" : "Type a reply… (⌘+Enter to send)"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              disabled={pending}
            />
            <button className="btn primary" onClick={submit} disabled={pending || !draft.trim()}>
              <I.send size={13} /> {pending ? (lang === "ko" ? "전송 중…" : "Sending…") : (lang === "ko" ? "전송" : "Send")}
            </button>
          </div>
        </div>
      </div>

      <div className="msg-context">
        <div className="ctx-h"><span className="tracker">{lang === "ko" ? "예약 상세" : "Booking detail"}</span></div>
        <div className="ctx-card">
          {cur.bookingRef ? (
            <>
              <div className="ctx-row"><span>ID</span><span className="mono">{cur.bookingRef}</span></div>
              <div className="ctx-row"><span>{lang === "ko" ? "체크인" : "Check-in"}</span><span className="num">{formatMd(cur.bookingCheckIn)}</span></div>
              <div className="ctx-row"><span>{lang === "ko" ? "체크아웃" : "Check-out"}</span><span className="num">{formatMd(cur.bookingCheckOut)}</span></div>
              <div className="ctx-row"><span>{lang === "ko" ? "객실" : "Room type"}</span><span>{cur.bookingRoomType ?? "—"}</span></div>
              <div className="ctx-row"><span>{lang === "ko" ? "총액" : "Total"}</span><span className="num">{cur.bookingTotal ? `₩${cur.bookingTotal.toLocaleString()}` : "—"}</span></div>
            </>
          ) : (
            <div className="text-muted" style={{ fontSize: 12 }}>
              {lang === "ko" ? "연결된 예약 없음" : "No linked booking"}
            </div>
          )}
        </div>
        <div className="ctx-h" style={{ marginTop: 16 }}><span className="tracker">{lang === "ko" ? "게스트" : "Guest"}</span></div>
        <div className="ctx-card">
          <div className="g-summary">
            <div className="bd-avatar" style={{ width: 40, height: 40, fontSize: 16 }}>{cur.guestName.charAt(0)}</div>
            <div>
              <div style={{ fontWeight: 600 }}>{cur.guestName}</div>
              <div className="text-muted" style={{ fontSize: 11 }}>{cur.guestFlag} {cur.guestCountry ?? ""}</div>
            </div>
          </div>
        </div>
        <div className="ctx-h" style={{ marginTop: 16 }}><span className="tracker">{lang === "ko" ? "저장된 답변" : "Saved replies"}</span></div>
        <div className="ctx-card replies">
          {savedReplies.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 12, padding: "4px 6px" }}>
              {lang === "ko" ? "저장된 답변 없음" : "No saved replies"}
            </div>
          ) : (
            savedReplies.map((r) => (
              <button key={r.id} className="ctx-reply" title={r.body}>
                {r.label}
              </button>
            ))
          )}
        </div>
      </div>

      <style>{`
        .msg-wrap { display: grid; grid-template-columns: 320px 1fr 280px; height: 100%;}
        .msg-list { border-right: 1px solid var(--bd-1); display: flex; flex-direction: column; background: var(--bg-1);}
        .ml-head { padding: 8px 0; border-bottom: 1px solid var(--bd-1);}
        .ml-tabs { display: flex; gap: 2px; padding: 0 12px;}
        .ml-tabs .tab { border: 0; background: transparent; padding: 6px 10px; font: inherit; font-size: var(--fs-sm); color: var(--t-3); cursor: pointer; border-radius: 4px; display: inline-flex; align-items: center; gap: 5px;}
        .ml-tabs .tab.active { color: var(--t-1); font-weight: 500; background: var(--bg-elev);}
        .ml-tabs .tab .cnt { color: var(--t-3); font-size: 11px;}
        .search-bar { display: flex; align-items: center; gap: 6px; padding: 0 10px; height: 28px; background: var(--bg); border: 1px solid var(--bd-1); border-radius: var(--r-sm); color: var(--t-3);}
        .search-bar input { flex: 1; border: 0; background: transparent; outline: none; font: inherit; font-size: var(--fs-sm);}
        .thread-list { flex: 1; overflow: auto;}
        .thread { width: 100%; text-align: left; border: 0; background: transparent; padding: 12px; border-bottom: 1px solid var(--bd-1); cursor: pointer; font: inherit; display: flex; gap: 10px;}
        .thread:hover { background: var(--bg-hover);}
        .thread.active { background: var(--bg-elev); box-shadow: inset 3px 0 0 var(--acc);}
        .th-av { position: relative; flex: 0 0 36px;}
        .ch-badge { position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; border-radius: 4px; border: 2px solid var(--bg-1);}
        .thread.active .ch-badge { border-color: var(--bg-elev);}
        .th-body { flex: 1; min-width: 0;}
        .th-top { display: flex; justify-content: space-between; align-items: center;}
        .th-top .nm { font-weight: 600; font-size: var(--fs-md); color: var(--t-1);}
        .th-top .tm { font-size: 11px;}
        .th-mid { margin: 2px 0;}
        .th-last { display: flex; justify-content: space-between; align-items: center; gap: 8px;}
        .snippet { font-size: var(--fs-xs); color: var(--t-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
        .unread { background: var(--acc); color: white; padding: 0 6px; min-width: 16px; height: 16px; line-height: 16px; border-radius: 999px; font-size: 10px; font-weight: 600; text-align: center;}
        .sla-dot { display: inline-block; width: 7px; height: 7px; border-radius: 999px; margin-right: 5px; vertical-align: middle; }
        .sla-dot.sla-fresh   { background: var(--ok); }
        .sla-dot.sla-warning { background: var(--warn); }
        .sla-dot.sla-stale   { background: var(--bad); animation: pulse 1.4s ease-in-out infinite; }
        .sla-pill {
          margin-left: 6px; padding: 1px 6px; border-radius: 999px;
          font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
        }
        .sla-pill.sla-fresh   { background: var(--ok-soft); color: var(--ok); }
        .sla-pill.sla-warning { background: var(--warn-soft); color: var(--warn); }
        .sla-pill.sla-stale   { background: var(--bad-soft); color: var(--bad); }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.18); }
        }

        .msg-conv { display: flex; flex-direction: column; min-height: 0; background: var(--bg);}
        .conv-head { padding: 12px 20px; border-bottom: 1px solid var(--bd-1); display: flex; justify-content: space-between; align-items: center;}
        .ch-info { display: flex; gap: 10px; align-items: center;}
        .ch-name { font-weight: 600; color: var(--t-1);}
        .ch-sub { font-size: var(--fs-xs);}
        .conv-body { flex: 1; overflow: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 8px;}
        .day-divider { text-align: center; margin: 8px 0;}
        .day-divider span { font-size: 11px; color: var(--t-3); background: var(--bg-mute); padding: 2px 10px; border-radius: 999px;}
        .sys-msg { text-align: center; font-size: 11px; color: var(--t-3); padding: 4px 0;}
        .bubble { max-width: 60%; padding: 10px 12px; border-radius: 12px; font-size: var(--fs-md); line-height: 1.45; align-self: flex-start;}
        .bubble.them { background: var(--bg-mute); color: var(--t-1); border-bottom-left-radius: 4px;}
        .bubble.me { background: var(--acc); color: white; align-self: flex-end; border-bottom-right-radius: 4px;}
        .bub-time { font-size: 10px; margin-top: 4px;}
        .bubble.them .bub-time { color: var(--t-3);}
        .bubble.me .bub-time { color: rgba(255,255,255,0.8);}

        .conv-input { border-top: 1px solid var(--bd-1); padding: 10px 20px 14px;}
        .ai-suggest { display: flex; align-items: center; gap: 6px; padding: 8px 10px; margin-bottom: 8px; background: var(--acc-soft); border-radius: var(--r-sm); color: var(--acc-text); flex-wrap: wrap;}
        .ai-chip { border: 1px solid var(--acc-bd); background: var(--bg); color: var(--acc-text); font: inherit; font-size: var(--fs-xs); padding: 3px 8px; border-radius: 4px; cursor: pointer;}
        .ai-chip:hover { background: var(--acc); color: white;}
        .input-row { display: flex; gap: 6px; align-items: flex-end;}
        .msg-input { flex: 1; min-height: 40px; max-height: 120px; resize: none; border: 1px solid var(--bd-2); border-radius: var(--r-sm); padding: 10px 12px; font: inherit; font-size: var(--fs-md); outline: none; color: var(--t-1); background: var(--bg);}
        .msg-input:focus { border-color: var(--acc); box-shadow: 0 0 0 3px var(--acc-soft);}
        .send-err { font-size: 12px; color: var(--bad); background: var(--bad-soft); padding: 6px 10px; border-radius: var(--r-sm); margin-bottom: 8px; }

        .msg-context { border-left: 1px solid var(--bd-1); padding: 16px; background: var(--bg-1); overflow: auto;}
        .ctx-h { padding: 0 0 6px;}
        .ctx-card { background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: var(--r-md); padding: 12px;}
        .ctx-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: var(--fs-sm); color: var(--t-2);}
        .ctx-row > span:first-child { color: var(--t-3);}
        .ctx-row > span:last-child { color: var(--t-1); font-weight: 500;}
        .g-summary { display: flex; gap: 10px; align-items: center;}
        .replies { display: flex; flex-direction: column; gap: 4px; padding: 8px;}
        .ctx-reply { text-align: left; border: 0; background: var(--bg-mute); padding: 6px 10px; font: inherit; font-size: var(--fs-sm); cursor: pointer; border-radius: 4px; color: var(--t-2);}
        .ctx-reply:hover { background: var(--bg-hover); color: var(--t-1);}

        .bd-avatar { width: 40px; height: 40px; border-radius: 999px; background: linear-gradient(135deg, #fcd34d, #f59e0b); color: #78350f; font-weight: 700; font-size: 16px; display: flex; align-items: center; justify-content: center; flex: 0 0 40px;}
        .mini-ch { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-xs); color: var(--t-2); font-weight: 500;}
        .mini-ch .dot { width: 7px; height: 7px; border-radius: 2px; flex: 0 0 7px;}
      `}</style>
    </div>
  );
};
