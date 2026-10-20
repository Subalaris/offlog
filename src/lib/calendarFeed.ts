import { createHash } from "node:crypto";
import type { Booking, FlightLeg } from "./types";
import { TYPE_META } from "./types";
import { buildItinerary, itineraryEventLabel } from "./itinerary";
import { stayTimes } from "./stays";
import { bookingFlightLegs } from "./flights";

export interface CalendarBooking extends Pick<Booking, "id" | "type" | "title" | "date" | "time" | "ends_at" | "checkout_time" | "provider" | "from_place" | "to_place" | "status"> {
  updated_at: string;
  flight_legs: Omit<FlightLeg, "seat">[];
}
export interface CalendarTrip {
  id: string; name: string; destination: string; updated_at: string;
  bookings: CalendarBooking[];
}
export interface CalendarFeed { updated_at: string; trips: CalendarTrip[] }

export function isCalendarToken(token: string) { return /^[a-f0-9]{64}$/.test(token); }

function text(value: string) {
  return value.replaceAll("\\", "\\\\").replace(/\r\n|\r|\n/g, "\\n").replaceAll(";", "\\;").replaceAll(",", "\\,");
}
function fold(line: string) {
  let result = "", bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, "utf8");
    if (bytes + size > 75) { result += "\r\n "; bytes = 1; }
    result += char; bytes += size;
  }
  return result;
}
function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function nextDay(value: string) { return new Date(Date.parse(value) + 86_400_000).toISOString().slice(0, 10); }
function stamp(date: Date) { return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }

export function renderCalendar(feed: CalendarFeed, siteOrigin: string) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OffLog//Travel itinerary//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:OffLog trips"];
  const entries: { date: string; uid: string; lines: string[] }[] = [];
  for (const trip of feed.trips) {
    for (const record of trip.bookings) {
      // Sensitive fields are deliberately absent from both the feed query and descriptions.
      const booking: Booking = { ...record, trip_id: trip.id, date: record.date || "", time: record.time || "",
        notes: "", reference: "", cost: null, currency: "", seat: "",
        flight_legs: (record.flight_legs ?? []).map(leg => ({ ...leg, seat: "" })),
      };
      for (const day of buildItinerary([booking])) {
        if (!validDate(day.date)) continue;
        for (const event of day.items) {
          const uid = createHash("sha256").update(JSON.stringify([trip.id, record.id, event.kind, event.legIndex ?? null])).digest("hex") + "@offlog";
          const label = itineraryEventLabel(event) || TYPE_META[booking.type].label;
          const summary = `${label}: ${booking.title || booking.provider || TYPE_META[booking.type].label} · ${trip.name}`;
          const details = [`Trip: ${trip.name}`, "All times below are local to the booking location."];
          if (booking.provider) details.push(`Provider: ${booking.provider}`);
          let location = trip.destination;
          if (booking.type === "flight") {
            const leg = bookingFlightLegs(booking)[event.legIndex ?? 0];
            if (leg.flight_number) details.push(`Flight: ${leg.flight_number}`);
            details.push(`From: ${leg.from_place}`, `To: ${leg.to_place}`);
            if (leg.departure_date || leg.departure_time) details.push(`Departure: ${leg.departure_date} ${leg.departure_time}`.trim());
            if (leg.arrival_date || leg.arrival_time) details.push(`Arrival: ${leg.arrival_date} ${leg.arrival_time}`.trim());
            location = event.kind === "flight-arrival" ? leg.to_place : leg.from_place;
          } else if (booking.type === "stay") {
            const { checkIn, checkOut } = stayTimes(booking);
            details.push(`Check-in: ${booking.date} ${checkIn}`);
            if (booking.ends_at) details.push(`Checkout: ${booking.ends_at} ${checkOut}`);
            location = booking.title || trip.destination;
          } else {
            if (booking.time) details.push(`Time: ${booking.time.slice(0, 5)}`);
            if (booking.from_place) details.push(`From: ${booking.from_place}`);
            if (booking.to_place) details.push(`To: ${booking.to_place}`);
            location = booking.from_place || trip.destination;
          }
          const url = new URL(`/trips/${encodeURIComponent(trip.id)}`, siteOrigin).href;
          details.push(`Open in OffLog: ${url}`);
          const modified = Math.max(...[feed.updated_at, trip.updated_at, record.updated_at].map(value => Date.parse(value)).filter(Number.isFinite), 0);
          entries.push({ date: day.date, uid, lines: [
            "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp(new Date(modified))}`, `LAST-MODIFIED:${stamp(new Date(modified))}`,
            `SEQUENCE:${Math.min(2147483647, Math.floor(modified / 1000))}`,
            `DTSTART;VALUE=DATE:${day.date.replaceAll("-", "")}`, `DTEND;VALUE=DATE:${nextDay(day.date).replaceAll("-", "")}`,
            `SUMMARY:${text(summary)}`, `DESCRIPTION:${text(details.join("\n"))}`, `LOCATION:${text(location)}`, `URL:${url}`,
            `STATUS:${booking.status === "pending" ? "TENTATIVE" : "CONFIRMED"}`, "TRANSP:TRANSPARENT", "END:VEVENT",
          ] });
        }
      }
    }
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.uid.localeCompare(b.uid));
  for (const entry of entries) lines.push(...entry.lines);
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
