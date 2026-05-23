import { getHotelInfo, getSavedReplies } from "@/lib/queries";
import { withTenant } from "@/lib/db";
import { currentHotelId } from "@/lib/tenant";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const hotelId = await currentHotelId();
  const [hotel, savedReplies] = await withTenant(hotelId, () =>
    Promise.all([getHotelInfo(), getSavedReplies()]),
  );
  return <SettingsClient hotel={hotel} savedReplies={savedReplies} />;
}
