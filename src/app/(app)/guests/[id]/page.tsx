import { notFound } from "next/navigation";
import { getGuestProfile } from "@/lib/queries";
import { GuestProfileClient } from "./GuestProfileClient";

export const dynamic = "force-dynamic";

export default async function GuestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getGuestProfile(id);
  if (!profile) notFound();
  return <GuestProfileClient profile={profile} />;
}
