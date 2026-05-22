import { getBookings, getRoomTypeOptions } from "@/lib/queries";
import { MobileBookingsClient } from "./MobileBookingsClient";

export const dynamic = "force-dynamic";

export default async function MobileBookingsPage() {
  const [bookings, roomTypeOptions] = await Promise.all([getBookings(), getRoomTypeOptions()]);
  return <MobileBookingsClient bookings={bookings} roomTypeOptions={roomTypeOptions} />;
}
