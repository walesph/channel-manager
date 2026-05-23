import { getRoomBoard } from "@/lib/queries";
import { withTenant } from "@/lib/db";
import { currentHotelId } from "@/lib/tenant";
import { HousekeepingClient } from "./HousekeepingClient";

export const dynamic = "force-dynamic";

export default async function HousekeepingPage() {
  const board = await withTenant(await currentHotelId(), () => getRoomBoard());
  return <HousekeepingClient board={board} />;
}
