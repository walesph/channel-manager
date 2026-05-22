import { getHotelInfo, getSavedReplies } from "@/lib/queries";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [hotel, savedReplies] = await Promise.all([getHotelInfo(), getSavedReplies()]);
  return <SettingsClient hotel={hotel} savedReplies={savedReplies} />;
}
