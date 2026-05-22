"use client";

import { Rooms } from "@/components/rooms/Rooms";
import { useApp } from "@/lib/app-context";
import type { RoomTypeWithRates } from "@/lib/queries";

export function RoomsClient({ roomTypes }: { roomTypes: RoomTypeWithRates[] }) {
  const { lang } = useApp();
  return <Rooms lang={lang} roomTypes={roomTypes} />;
}
