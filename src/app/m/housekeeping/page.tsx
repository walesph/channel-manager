import { getRoomBoard } from "@/lib/queries";
import { MobileHousekeepingClient } from "./MobileHousekeepingClient";

export const dynamic = "force-dynamic";

export default async function MobileHousekeepingPage() {
  const board = await getRoomBoard();
  return <MobileHousekeepingClient board={board} />;
}
