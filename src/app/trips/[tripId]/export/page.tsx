import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTrip, getBookings } from "@/lib/db";
import { TripExport } from "./TripExport";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Export trip", robots: { index: false, follow: false } };

export default async function ExportTripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const trip = await getTrip(tripId);
  if (!trip) notFound();
  const bookings = await getBookings(tripId);
  return <TripExport trip={trip} bookings={bookings} />;
}
