import { notFound } from "next/navigation";
import { getKioskBookingByToken } from "@/lib/actions";
import { KioskClient } from "./KioskClient";

export const dynamic = "force-dynamic";

export default async function KioskPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = await getKioskBookingByToken(token);
  if (!booking) notFound();
  return <KioskClient token={token} booking={booking} />;
}
