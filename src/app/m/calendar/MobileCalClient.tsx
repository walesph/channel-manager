"use client";

import { MobileCalDayList } from "@/components/mobile/MobileDash";
import { useApp } from "@/lib/app-context";
import type { CalendarGrid } from "@/lib/queries";

export function MobileCalClient({ grid }: { grid: CalendarGrid }) {
  const { lang } = useApp();
  return <MobileCalDayList lang={lang} grid={grid} />;
}
