import "server-only";
import { prisma } from "./db";
import { EmailTemplateKind } from "@prisma/client";

/**
 * Per-hotel email template resolver.
 *
 * Lookup order: per-hotel `EmailTemplate` row → built-in default. The cron
 * uses this to render check-in reminders, review requests, and payment-failed
 * notifications. Variables are substituted with `{{var}}` syntax.
 *
 * Supported variables (subset, depending on kind):
 *   - {{guestName}}    Guest's display name
 *   - {{hotelName}}    Hotel's display name
 *   - {{checkIn}}      ISO date (YYYY-MM-DD)
 *   - {{bookingRef}}   externalRef or short id
 */

export interface RenderedTemplate {
  subject: string;
  body: string;
  /** True when the rendered template came from the built-in fallback (no per-hotel override existed). */
  fromDefault: boolean;
  /** True when the per-hotel template exists but was disabled — caller should skip the send. */
  disabled: boolean;
}

const DEFAULTS: Record<EmailTemplateKind, { subject: string; body: string }> = {
  checkin_reminder: {
    subject: "[{{hotelName}}] 체크인 안내 — {{checkIn}}",
    body: "{{guestName}}님 안녕하세요!\n\n곧 {{hotelName}}에 도착하시는 일정 ({{checkIn}}) 안내드립니다. 체크인 시 신분증을 준비해주세요.\n\n감사합니다.",
  },
  review_request: {
    subject: "[{{hotelName}}] 머무신 경험 어떠셨나요?",
    body: "{{guestName}}님 안녕하세요,\n\n{{hotelName}}에서의 시간 어떠셨나요? 짧은 리뷰로 경험을 공유해주시면 큰 도움이 됩니다 🙏\n\n감사합니다.",
  },
  payment_failed: {
    subject: "[{{hotelName}}] 결제 처리 실패 — {{bookingRef}}",
    body: "{{guestName}}님 안녕하세요,\n\n예약 ({{bookingRef}})의 결제가 실패했습니다. 카드 정보를 다시 확인해 주세요.\n\n감사합니다.",
  },
};

function substitute(template: string, vars: Record<string, string>): string {
  // Tolerant of missing keys — leaves `{{unknown}}` as-is so QA can spot
  // template authoring mistakes in dev preview.
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export async function renderEmailTemplate(
  hotelId: string,
  kind: EmailTemplateKind,
  vars: Record<string, string>,
): Promise<RenderedTemplate> {
  const override = await prisma.emailTemplate.findUnique({
    where: { hotelId_kind: { hotelId, kind } },
  });
  if (override && !override.enabled) {
    return { subject: "", body: "", fromDefault: false, disabled: true };
  }
  const source = override ?? DEFAULTS[kind];
  return {
    subject: substitute(source.subject, vars),
    body: substitute(source.body, vars),
    fromDefault: !override,
    disabled: false,
  };
}

/** Useful for the /settings/email-templates UI to show defaults as placeholders. */
export function defaultTemplate(kind: EmailTemplateKind): { subject: string; body: string } {
  return DEFAULTS[kind];
}
