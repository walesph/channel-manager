import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { getRecentActivity, getSavedFilters } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DesktopLayout({ children }: { children: ReactNode }) {
  const [activity, savedFilters] = await Promise.all([
    getRecentActivity(20),
    getSavedFilters(),
  ]);
  return <AppShell activity={activity} savedFilters={savedFilters}>{children}</AppShell>;
}
