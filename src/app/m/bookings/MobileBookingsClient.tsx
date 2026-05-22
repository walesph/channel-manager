"use client";

import { MobileBookings } from "@/components/mobile/MobileBookings";
import { useApp } from "@/lib/app-context";
import type { BookingRow, RoomTypeOption } from "@/lib/queries";

export function MobileBookingsClient({ bookings, roomTypeOptions }: { bookings: BookingRow[]; roomTypeOptions: RoomTypeOption[] }) {
  const { lang } = useApp();
  return <MobileBookings lang={lang} bookings={bookings} roomTypeOptions={roomTypeOptions} />;
}
