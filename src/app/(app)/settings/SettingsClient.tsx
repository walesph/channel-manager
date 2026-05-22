"use client";

import { Settings } from "@/components/settings/Settings";
import { useApp } from "@/lib/app-context";
import type { HotelInfo, SavedReplyRow } from "@/lib/queries";

export function SettingsClient({ hotel, savedReplies }: { hotel: HotelInfo; savedReplies: SavedReplyRow[] }) {
  const { lang } = useApp();
  return <Settings lang={lang} hotel={hotel} savedReplies={savedReplies} />;
}
