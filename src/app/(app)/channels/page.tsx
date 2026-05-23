import { getChannelMappings, getChannelOverview, getMiddlewares, getRateParityReport, getSyncLog } from "@/lib/queries";
import { withTenant } from "@/lib/db";
import { currentHotelId } from "@/lib/tenant";
import { ChannelsClient } from "./ChannelsClient";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const hotelId = await currentHotelId();
  const [overview, syncLog, middlewares, mappings, parity] = await withTenant(hotelId, () =>
    Promise.all([
      getChannelOverview(),
      getSyncLog(),
      getMiddlewares(),
      getChannelMappings(),
      getRateParityReport(7, 10),
    ]),
  );
  return <ChannelsClient overview={overview} syncLog={syncLog} middlewares={middlewares} mappings={mappings} parity={parity} />;
}
