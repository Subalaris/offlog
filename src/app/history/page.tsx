import type { Metadata } from "next";
import { getTrips, getVisits } from "@/lib/db";
import { todayStr } from "@/lib/format";
import { HistoryClient } from "./HistoryClient";

export const metadata: Metadata = { title: "Travel History" };
export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const [visits, trips] = await Promise.all([getVisits(), getTrips()]);
  const linkedTripIds = new Set(visits.map((visit) => visit.trip_id).filter(Boolean));
  const suggestions = trips
    .filter((trip) => trip.end_date < todayStr() && !linkedTripIds.has(trip.id))
    .sort((a, b) => b.end_date.localeCompare(a.end_date));

  return <HistoryClient visits={visits} tripSuggestions={suggestions} />;
}
