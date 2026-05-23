import { getRoomTypesWithRates } from "@/lib/queries";
import { withTenant } from "@/lib/db";
import { currentHotelId } from "@/lib/tenant";
import { RoomsClient } from "./RoomsClient";

export const dynamic = "force-dynamic";

export default async function RoomsPage() {
  const roomTypes = await withTenant(await currentHotelId(), () => getRoomTypesWithRates());
  return <RoomsClient roomTypes={roomTypes} />;
}
