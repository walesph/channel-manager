"use client";

import { MobileDash } from "@/components/mobile/MobileDash";
import { useApp } from "@/lib/app-context";
import type { MobileDashboardData } from "@/lib/queries";

export function MobileDashClient({ data }: { data: MobileDashboardData }) {
  const { lang } = useApp();
  return <MobileDash lang={lang} data={data} />;
}
