"use client";

import { Channels } from "@/components/channels/Channels";
import { useApp } from "@/lib/app-context";
import type { ChannelMappingRow, ChannelOverviewRow, MiddlewareRow, RateParityReport, SyncLogRow } from "@/lib/queries";

export function ChannelsClient({
  overview,
  syncLog,
  middlewares,
  mappings,
  parity,
}: {
  overview: ChannelOverviewRow[];
  syncLog: SyncLogRow[];
  middlewares: MiddlewareRow[];
  mappings: ChannelMappingRow[];
  parity: RateParityReport;
}) {
  const { lang } = useApp();
  return (
    <Channels lang={lang} overview={overview} syncLog={syncLog} middlewares={middlewares} mappings={mappings} parity={parity} />
  );
}
