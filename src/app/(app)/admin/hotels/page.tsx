import { getHotelsSummary } from "@/lib/queries";
import { AdminHotelsClient } from "./AdminHotelsClient";

export const dynamic = "force-dynamic";

export default async function AdminHotelsPage() {
  const hotels = await getHotelsSummary();
  return <AdminHotelsClient hotels={hotels} />;
}
