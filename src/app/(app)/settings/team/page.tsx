import { currentClerkOrgId, isClerkEnabled } from "@/lib/tenant";
import { TeamClient } from "./TeamClient";

export const dynamic = "force-dynamic";

export interface TeamMemberRow {
  id: string;
  name: string;
  email: string | null;
  role: string;
  imageUrl: string | null;
  joinedAt: string;
}

interface OrgSnapshot {
  id: string;
  name: string;
  slug: string | null;
  membersCount: number;
}

async function loadOrgSnapshot(): Promise<{ org: OrgSnapshot; members: TeamMemberRow[] } | null> {
  if (!isClerkEnabled()) return null;
  const orgId = await currentClerkOrgId();
  if (!orgId) return null;
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const [org, memberships] = await Promise.all([
      client.organizations.getOrganization({ organizationId: orgId }),
      client.organizations.getOrganizationMembershipList({ organizationId: orgId, limit: 50 }),
    ]);
    const members: TeamMemberRow[] = memberships.data.map((m) => ({
      id: m.id,
      name: [m.publicUserData?.firstName, m.publicUserData?.lastName].filter(Boolean).join(" ") || (m.publicUserData?.identifier ?? "—"),
      email: m.publicUserData?.identifier ?? null,
      role: m.role,
      imageUrl: m.publicUserData?.imageUrl ?? null,
      joinedAt: new Date(m.createdAt).toISOString(),
    }));
    return {
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        membersCount: org.membersCount ?? memberships.data.length,
      },
      members,
    };
  } catch {
    return null;
  }
}

export default async function TeamPage() {
  const data = await loadOrgSnapshot();
  return <TeamClient enabled={isClerkEnabled()} data={data} />;
}
