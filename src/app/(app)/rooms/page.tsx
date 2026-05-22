import { getRoomTypesWithRates } from "@/lib/queries";
import { RoomsClient } from "./RoomsClient";

export const dynamic = "force-dynamic";

export default async function RoomsPage() {
  const roomTypes = await getRoomTypesWithRates();
  return <RoomsClient roomTypes={roomTypes} />;
}
