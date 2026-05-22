"use client";

import { Bookings, type BookingsFilterState, type BookingsPaginationState } from "@/components/bookings/Bookings";
import { useApp } from "@/lib/app-context";
import type { BookingRow, RoomConflictRow, RoomTypeOption } from "@/lib/queries";

export function BookingsClient({
  bookings,
  roomTypeOptions,
  filter,
  pagination,
  conflicts,
}: {
  bookings: BookingRow[];
  roomTypeOptions: RoomTypeOption[];
  filter: BookingsFilterState;
  pagination: BookingsPaginationState;
  conflicts: RoomConflictRow[];
}) {
  const { lang } = useApp();
  return (
    <Bookings
      lang={lang}
      bookings={bookings}
      roomTypeOptions={roomTypeOptions}
      filter={filter}
      pagination={pagination}
      conflicts={conflicts}
    />
  );
}
