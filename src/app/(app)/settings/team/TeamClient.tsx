"use client";

import Link from "next/link";
import { useApp } from "@/lib/app-context";
import { I } from "@/components/icons";
import type { TeamMemberRow } from "./page";

interface OrgSnapshot {
  id: string;
  name: string;
  slug: string | null;
  membersCount: number;
}

interface Props {
  enabled: boolean;
  data: { org: OrgSnapshot; members: TeamMemberRow[] } | null;
}

function fmtDate(iso: string, lang: import("@/lib/i18n").Lang): string {
  const d = new Date(iso);
  return d.toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US", { year: "numeric", month: "short", day: "numeric" });
}

function roleLabel(role: string, lang: import("@/lib/i18n").Lang): { text: string; cls: string } {
  // Clerk default roles: org:admin, org:member. Custom roles fall through.
  const r = role.toLowerCase();
  if (r.endsWith(":admin") || r === "admin" || r === "owner") {
    return { text: lang === "ko" ? "관리자" : "Admin", cls: "ok" };
  }
  if (r.endsWith(":member") || r === "member") {
    return { text: lang === "ko" ? "멤버" : "Member", cls: "info" };
  }
  return { text: role, cls: "muted" };
}

export function TeamClient({ enabled, data }: Props) {
  const { lang } = useApp();

  return (
    <div className="page">
      <div className="header">
        <div>
          <Link href="/settings" className="back-link text-muted">
            <I.arrowL size={11} /> {lang === "ko" ? "설정" : "Settings"}
          </Link>
          <h1>{lang === "ko" ? "팀" : "Team"}</h1>
          <div className="sub text-muted">
            {lang === "ko"
              ? "이 호텔에 속한 사용자들 — Clerk Organization 단위로 관리됩니다"
              : "Users in this hotel — managed via Clerk Organizations"}
          </div>
        </div>
      </div>

      {!enabled ? (
        <section className="card empty-state">
          <I.user size={28} />
          <div className="title">{lang === "ko" ? "Clerk가 설정되지 않았습니다" : "Clerk is not configured"}</div>
          <p className="text-muted">
            {lang === "ko"
              ? "팀 관리는 Clerk Organization 기능을 사용합니다. .env에 NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY와 CLERK_SECRET_KEY를 추가한 뒤 Clerk 대시보드에서 Organizations를 활성화하세요."
              : "Team management uses Clerk Organizations. Add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY to .env, then enable Organizations in the Clerk dashboard."}
          </p>
          <a className="btn sm" href="https://dashboard.clerk.com" target="_blank" rel="noreferrer">
            <I.external size={11} /> Clerk Dashboard
          </a>
        </section>
      ) : !data ? (
        <section className="card empty-state">
          <I.warn size={28} style={{ color: "var(--warn)" }} />
          <div className="title">{lang === "ko" ? "활성 Organization 없음" : "No active organization"}</div>
          <p className="text-muted">
            {lang === "ko"
              ? "사용자 메뉴에서 Organization을 선택하거나 새로 만들어주세요. 새 Org가 생성되면 webhook이 자동으로 호텔을 프로비저닝합니다."
              : "Pick or create an Organization from the user menu. New orgs auto-provision a hotel via webhook."}
          </p>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="sec-h">
              <div>
                <div className="title">{data.org.name}</div>
                <div className="sub">
                  {data.org.slug ? `@${data.org.slug} · ` : ""}
                  {data.members.length} / {data.org.membersCount} {lang === "ko" ? "멤버" : "members"}
                </div>
              </div>
              <a
                className="btn sm"
                href={`https://dashboard.clerk.com/last-active?path=organizations/${data.org.id}/members`}
                target="_blank"
                rel="noreferrer"
              >
                <I.plus size={11} /> {lang === "ko" ? "초대" : "Invite"}
              </a>
            </div>
            <table className="t-list">
              <thead>
                <tr>
                  <th>{lang === "ko" ? "사용자" : "User"}</th>
                  <th>{lang === "ko" ? "역할" : "Role"}</th>
                  <th>{lang === "ko" ? "가입" : "Joined"}</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => {
                  const r = roleLabel(m.role, lang);
                  return (
                    <tr key={m.id}>
                      <td>
                        <div className="user-cell">
                          {m.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.imageUrl} alt="" className="avatar-sm" />
                          ) : (
                            <div className="avatar-sm fallback">{m.name.slice(0, 1).toUpperCase()}</div>
                          )}
                          <div>
                            <div style={{ fontWeight: 500 }}>{m.name}</div>
                            {m.email && <div className="text-muted" style={{ fontSize: 11 }}>{m.email}</div>}
                          </div>
                        </div>
                      </td>
                      <td><span className={`pill ${r.cls}`}>{r.text}</span></td>
                      <td className="text-muted">{fmtDate(m.joinedAt, lang)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="card meta-card">
            <div className="sec-h">
              <div className="title">{lang === "ko" ? "Org → 호텔 매핑" : "Org → hotel mapping"}</div>
            </div>
            <div className="meta-body">
              <div className="meta-row">
                <span className="text-muted">Clerk Organization ID</span>
                <code>{data.org.id}</code>
              </div>
              <div className="meta-row">
                <span className="text-muted">{lang === "ko" ? "변경 방법" : "How to change"}</span>
                <span style={{ fontSize: 12 }}>
                  {lang === "ko"
                    ? "Clerk 대시보드 → Organization → publicMetadata에 hotelId 수정"
                    : "Clerk Dashboard → Organization → edit hotelId in publicMetadata"}
                </span>
              </div>
            </div>
          </section>
        </>
      )}

      <style>{`
        .page { padding: 20px 24px 32px; display: flex; flex-direction: column; gap: 16px; }
        .header h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin: 6px 0 2px; color: var(--t-1); }
        .back-link { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; text-decoration: none; }
        .header .sub { font-size: 12px; }
        .empty-state { padding: 40px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--t-3); }
        .empty-state .title { font-weight: 600; color: var(--t-1); font-size: 14px; margin-top: 4px; }
        .empty-state p { max-width: 380px; font-size: 12px; line-height: 1.5; margin: 0 0 8px; }
        .user-cell { display: flex; align-items: center; gap: 10px; }
        .avatar-sm { width: 28px; height: 28px; border-radius: 999px; object-fit: cover; flex: 0 0 28px; }
        .avatar-sm.fallback { background: var(--bg-mute); color: var(--t-2); display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px; }
        .pill { padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; display: inline-flex; }
        .pill.ok    { background: var(--ok-soft); color: var(--ok); }
        .pill.info  { background: var(--acc-soft); color: var(--acc); }
        .pill.muted { background: var(--bg-mute); color: var(--t-3); }
        .t-list { width: 100%; border-collapse: collapse; font-size: var(--fs-md); }
        .t-list th { font-weight: 500; color: var(--t-3); text-align: left; padding: 8px 16px; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.04em; background: var(--bg-1); border-bottom: 1px solid var(--bd-1);}
        .t-list td { padding: 12px 16px; border-bottom: 1px solid var(--bd-1); color: var(--t-1); }
        .t-list tr:last-child td { border-bottom: 0;}
        .meta-card .meta-body { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 8px; font-size: 12px; }
        .meta-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
        .meta-row code { background: var(--bg-mute); padding: 2px 6px; border-radius: 4px; font-size: 11px; }
      `}</style>
    </div>
  );
}
