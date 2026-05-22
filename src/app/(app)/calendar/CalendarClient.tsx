"use client";

import { Calendar } from "@/components/calendar/Calendar";
import { useApp } from "@/lib/app-context";
import type { CalendarGrid } from "@/lib/queries";

export function CalendarClient({ grid }: { grid: CalendarGrid }) {
  const { lang } = useApp();
  return <Calendar lang={lang} grid={grid} />;
}
