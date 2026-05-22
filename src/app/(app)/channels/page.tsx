import { getChannelMappings, getChannelOverview, getMiddlewares, getRateParityReport, getSyncLog } from "@/lib/queries";
import { ChannelsClient } from "./ChannelsClient";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const [overview, syncLog, middlewares, mappings, parity] = await Promise.all([
    getChannelOverview(),
    getSyncLog(),
    getMiddlewares(),
    getChannelMappings(),
    getRateParityReport(7, 10),
  ]);
  return <ChannelsClient overview={overview} syncLog={syncLog} middlewares={middlewares} mappings={mappings} parity={parity} />;
}
