
import { notFound } from "next/navigation";
import { getTrip, getBookings, getDocuments } from "@/lib/db";
import { TripHero } from "./components/TripHero";
import { Timeline } from "./components/Timeline";
import { SpendingCard } from "./components/SpendingCard";
import { DocumentsSection } from "./components/DocumentsSection";

export const dynamic = "force-dynamic";

export default async function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const trip = await getTrip(tripId);
  if (!trip) notFound();
  const [bookings, documents] = await Promise.all([getBookings(tripId), getDocuments(tripId)]);

  return (
    <>
      <TripHero trip={trip} />

      <div className="lower-grid" id="itinerary">
        <Timeline trip={trip} bookings={bookings} />
        <SpendingCard trip={trip} bookings={bookings} />
      </div>

      <DocumentsSection tripId={tripId} docs={documents} />
    </>
  );
}
