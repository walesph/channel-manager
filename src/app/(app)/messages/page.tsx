import { getMessageThreads, getSavedReplies } from "@/lib/queries";
import { MessagesClient } from "./MessagesClient";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const [threads, savedReplies] = await Promise.all([getMessageThreads(), getSavedReplies()]);
  return <MessagesClient threads={threads} savedReplies={savedReplies} />;
}
