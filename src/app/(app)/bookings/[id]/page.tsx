import { notFound } from "next/navigation";
import { getBookingDetail } from "@/lib/queries";
import { withTenant } from "@/lib/db";
import { currentHotelId } from "@/lib/tenant";
import { BookingDetailClient } from "./BookingDetailClient";

export const dynamic = "force-dynamic";

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await withTenant(await currentHotelId(), () => getBookingDetail(id));
  if (!detail) notFound();
  return <BookingDetailClient detail={detail} />;
}
