"use client";

import { MobileMessages } from "@/components/mobile/MobileMessages";
import { useApp } from "@/lib/app-context";
import type { SavedReplyRow, ThreadRow } from "@/lib/queries";

export function MobileMessagesClient({ threads, savedReplies }: { threads: ThreadRow[]; savedReplies: SavedReplyRow[] }) {
  const { lang } = useApp();
  return <MobileMessages lang={lang} threads={threads} savedReplies={savedReplies} />;
}
