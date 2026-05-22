import { getPerfOverview } from "@/lib/queries";
import { PerfClient } from "./PerfClient";

export const dynamic = "force-dynamic";

export default async function PerfPage() {
  const overview = await getPerfOverview();
  return <PerfClient overview={overview} />;
}
