import { getMessageThreads, getSavedReplies } from "@/lib/queries";
import { withTenant } from "@/lib/db";
import { currentHotelId } from "@/lib/tenant";
import { MessagesClient } from "./MessagesClient";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const hotelId = await currentHotelId();
  const [threads, savedReplies] = await withTenant(hotelId, () =>
    Promise.all([getMessageThreads(), getSavedReplies()]),
  );
  return <MessagesClient threads={threads} savedReplies={savedReplies} />;
}
