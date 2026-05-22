import { getCalendarGrid } from "@/lib/queries";
import { MobileCalClient } from "./MobileCalClient";

export const dynamic = "force-dynamic";

export default async function MobileCalendarPage() {
  const grid = await getCalendarGrid(14);
  return <MobileCalClient grid={grid} />;
}
