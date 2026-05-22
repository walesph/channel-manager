"use client";

import { Automations } from "@/components/automations/Automations";
import { useApp } from "@/lib/app-context";
import type { AutomationOverview } from "@/lib/queries";

export function AutomationsClient({ overview }: { overview: AutomationOverview }) {
  const { lang } = useApp();
  return <Automations lang={lang} overview={overview} />;
}
