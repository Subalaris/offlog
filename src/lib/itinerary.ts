import type { Booking, Trip } from "./types";
import { bookingFlightLegs } from "./flights";
import { stayTimes } from "./stays";

export type ItineraryKind = "booking" | "check-in" | "check-out" | "staying" | "flight-departure" | "flight-arrival";
export interface ItineraryEvent {
  id: string;
  booking: Booking;
  kind: ItineraryKind;
  date: string;
  time: string;
  primary: boolean;
  legIndex?: number;
}
export interface ItineraryDay { date: string; items: ItineraryEvent[] }

export function itineraryEventLabel(event: ItineraryEvent) {
  switch (event.kind) {
    case "check-in": return "Check-in";
    case "check-out": return "Check-out";
    case "staying": return "Staying at";
    case "flight-departure": return "Flight departure";
    case "flight-arrival": return "Flight arrival";
    default: return "";
  }
}

export function buildItinerary(bookings: Booking[], trip?: Pick<Trip, "start_date" | "end_date">): ItineraryDay[] {
  const events: ItineraryEvent[] = [];
  for (const booking of bookings) {
    const add = (kind: ItineraryKind, date: string, time: string, primary = false, legIndex?: number) => {
      events.push({ id: `${booking.id}:${kind}:${legIndex ?? ""}:${date}`, booking, kind, date: date || "", time: time?.slice(0, 5) || "", primary, legIndex });
    };
    if (booking.type === "stay") {
      const { checkIn, checkOut } = stayTimes(booking);
      add("check-in", booking.date, checkIn, true);
      if (booking.ends_at) add("check-out", booking.ends_at.slice(0, 10), checkOut);
      // Stay context is limited to the trip's visible date range.
      if (booking.date && booking.ends_at && trip) {
        const start = booking.date > trip.start_date ? booking.date : trip.start_date;
        const end = booking.ends_at < trip.end_date ? booking.ends_at : trip.end_date;
        const cursor = new Date(`${start}T00:00:00Z`);
        while (Number.isFinite(cursor.getTime())) {
          const day = cursor.toISOString().slice(0, 10);
          if (day > end) break;
          if (day > booking.date && day < booking.ends_at) add("staying", day, "");
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
      }
    } else if (booking.type === "flight") {
      bookingFlightLegs(booking).forEach((leg, index) => {
        const departureDate = leg.departure_date || (index === 0 ? booking.date : "");
        add("flight-departure", departureDate, leg.departure_time, index === 0, index);
        // Same-day arrivals remain alongside departure details. Overnight arrivals get their own day entry.
        if (leg.arrival_date && leg.arrival_date !== departureDate) {
          add("flight-arrival", leg.arrival_date, leg.arrival_time, false, index);
        }
      });
    } else {
      add("booking", booking.date, booking.time, true);
    }
  }
  events.sort((a, b) => {
    if (a.date !== b.date) return (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99");
    // Overnight accommodation is day context, rather than an appointment at midnight.
    if ((a.kind === "staying") !== (b.kind === "staying")) return a.kind === "staying" ? -1 : 1;
    const byTime = (a.time || "24:00").localeCompare(b.time || "24:00");
    if (byTime) return byTime;
    // At matching times, end one reservation before starting the next.
    const priority = { "flight-arrival": 0, "check-out": 1, "flight-departure": 2, booking: 3, "check-in": 4, staying: 5 };
    return priority[a.kind] - priority[b.kind] || a.id.localeCompare(b.id);
  });
  const days = new Map<string, ItineraryEvent[]>();
  for (const event of events) {
    if (!days.has(event.date)) days.set(event.date, []);
    days.get(event.date)!.push(event);
  }
  return [...days].map(([date, items]) => ({ date, items }));
}
