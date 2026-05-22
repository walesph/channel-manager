"use client";

import { Messages } from "@/components/messages/Messages";
import { useApp } from "@/lib/app-context";
import type { SavedReplyRow, ThreadRow } from "@/lib/queries";

export function MessagesClient({ threads, savedReplies }: { threads: ThreadRow[]; savedReplies: SavedReplyRow[] }) {
  const { lang } = useApp();
  return <Messages lang={lang} threads={threads} savedReplies={savedReplies} />;
}
