"use client";

import { Revenue } from "@/components/revenue/Revenue";
import { useApp } from "@/lib/app-context";
import type { RevenueData, RevenueRange } from "@/lib/queries";

export function RevenueClient({ data, range }: { data: RevenueData; range: RevenueRange }) {
  const { lang } = useApp();
  return <Revenue lang={lang} data={data} range={range} />;
}
