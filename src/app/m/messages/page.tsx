import { getMessageThreads, getSavedReplies } from "@/lib/queries";
import { MobileMessagesClient } from "./MobileMessagesClient";

export const dynamic = "force-dynamic";

export default async function MobileMessagesPage() {
  const [threads, savedReplies] = await Promise.all([getMessageThreads(), getSavedReplies()]);
  return <MobileMessagesClient threads={threads} savedReplies={savedReplies} />;
}
