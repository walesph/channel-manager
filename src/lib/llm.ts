import "server-only";

/**
 * LLM provider abstraction for in-product AI features (message drafts,
 * subject-line suggestions, etc.).
 *
 * Providers (in priority order):
 *   1. Anthropic — when ANTHROPIC_API_KEY is set. claude-3-5-haiku by default.
 *   2. OpenAI    — when OPENAI_API_KEY is set. gpt-4o-mini by default.
 *   3. Mock      — deterministic template-based draft, never calls a network
 *                  service. Lets the UI flow stay testable in dev preview.
 *
 * Pricing-aware defaults: we use the cheapest competent model per provider
 * (Haiku / 4o-mini) since draft suggestions are inherently low-stakes —
 * the operator always reviews before sending.
 */

export type LlmProvider = "anthropic" | "openai" | "mock";

export function activeLlmProvider(): LlmProvider {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "mock";
}

export interface DraftReplyInput {
  /** Hotel name for tone/personalization. */
  hotelName: string;
  /** Guest name. */
  guestName: string;
  /** Guest's preferred language (ko/en/ja/zh). Defaults to "ko". */
  language?: string;
  /** Last guest message we're responding to. */
  lastMessage: string;
  /** Optional booking context: dates / room / channel. */
  context?: {
    checkIn?: string;
    checkOut?: string;
    roomType?: string;
    channel?: string;
  };
  /** Hint for the desired tone — defaults to "friendly". */
  tone?: "friendly" | "formal" | "concise";
}

export interface DraftReplyResult {
  ok: boolean;
  /** The drafted reply (Korean by default). */
  draft?: string;
  provider: LlmProvider;
  /** Tokens consumed when known (real providers). */
  tokens?: { input: number; output: number };
  /** Latency in ms. */
  latencyMs: number;
  error?: string;
}

const SYSTEM_PROMPT = `You are an experienced hotel operator drafting replies to a guest. \
Keep responses concise (2-4 sentences), warm but professional, and actionable. \
Always reply in the guest's preferred language. Never invent facts not in the context — \
if you don't know an answer, suggest checking with the operator. Do NOT include a signature \
or salutation block; the system handles that.`;

function buildUserPrompt(input: DraftReplyInput): string {
  const lang = input.language ?? "ko";
  const ctx = input.context;
  return `Hotel: ${input.hotelName}
Guest: ${input.guestName} (preferred language: ${lang})
${ctx?.checkIn ? `Check-in: ${ctx.checkIn}\n` : ""}\
${ctx?.checkOut ? `Check-out: ${ctx.checkOut}\n` : ""}\
${ctx?.roomType ? `Room type: ${ctx.roomType}\n` : ""}\
${ctx?.channel ? `Channel: ${ctx.channel}\n` : ""}\
Tone: ${input.tone ?? "friendly"}

Last guest message:
"""
${input.lastMessage.slice(0, 1500)}
"""

Draft a reply (in ${lang}):`;
}

function mockDraft(input: DraftReplyInput): string {
  const lang = input.language ?? "ko";
  if (lang === "ko") {
    return `${input.guestName}님 안녕하세요!\n\n메시지 잘 받았습니다. 곧 정확한 안내 드리겠습니다. 추가 문의사항이 있으시면 언제든 알려주세요.\n\n감사합니다.`;
  }
  return `Hi ${input.guestName},\n\nThanks for your message — we'll get back to you with details shortly. Let us know if there's anything else in the meantime.\n\nBest regards.`;
}

export async function draftReply(input: DraftReplyInput): Promise<DraftReplyResult> {
  const provider = activeLlmProvider();
  const startMs = Date.now();

  if (provider === "mock") {
    return {
      ok: true,
      draft: mockDraft(input),
      provider,
      latencyMs: Date.now() - startMs,
    };
  }

  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest",
          max_tokens: 400,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildUserPrompt(input) }],
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "<unreadable>");
        return { ok: false, provider, latencyMs: Date.now() - startMs, error: `anthropic ${res.status}: ${txt.slice(0, 200)}` };
      }
      const data = (await res.json()) as { content?: Array<{ text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
      const draft = data.content?.[0]?.text?.trim() ?? "";
      return {
        ok: true,
        draft,
        provider,
        latencyMs: Date.now() - startMs,
        tokens: { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 },
      };
    }

    // OpenAI Chat Completions
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(input) },
        ],
        max_tokens: 400,
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "<unreadable>");
      return { ok: false, provider, latencyMs: Date.now() - startMs, error: `openai ${res.status}: ${txt.slice(0, 200)}` };
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const draft = data.choices?.[0]?.message?.content?.trim() ?? "";
    return {
      ok: true,
      draft,
      provider,
      latencyMs: Date.now() - startMs,
      tokens: { input: data.usage?.prompt_tokens ?? 0, output: data.usage?.completion_tokens ?? 0 },
    };
  } catch (e) {
    return { ok: false, provider, latencyMs: Date.now() - startMs, error: e instanceof Error ? e.message : String(e) };
  }
}
