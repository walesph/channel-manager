import { getRoomBoard } from "@/lib/queries";
import { HousekeepingClient } from "./HousekeepingClient";

export const dynamic = "force-dynamic";

export default async function HousekeepingPage() {
  const board = await getRoomBoard();
  return <HousekeepingClient board={board} />;
}
