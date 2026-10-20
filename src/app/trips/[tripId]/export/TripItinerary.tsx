import type { Booking, Trip } from "@/lib/types";
import { TYPE_META } from "@/lib/types";
import { bookingFlightLegs } from "@/lib/flights";
import { buildItinerary, itineraryEventLabel } from "@/lib/itinerary";
import { stayTimes } from "@/lib/stays";
import { fmtMoney } from "@/lib/format";
import styles from "./export.module.css";

export interface ExportOptions { costs: boolean; references: boolean; notes: boolean }

function dateLabel(value: string) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  }) : "Date to be confirmed";
}

function dateTime(date: string, time: string) {
  return [date && dateLabel(date), time?.slice(0, 5)].filter(Boolean).join(" · ") || "To be confirmed";
}

const statuses = { booked: "Booked", pending: "Pending", done: "Done" };

export function TripItinerary({ trip, bookings, options }: {
  trip: Trip; bookings: Booking[]; options: ExportOptions;
}) {
  const days = buildItinerary(bookings, trip);

  return (
    <article className={styles.paper} aria-label="Itinerary preview">
      <header className={styles.tripHeader}>
        <div className={styles.brand}>OFFLOG · TRAVEL ITINERARY</div>
        <h2>{trip.name}</h2>
        {trip.destination && <p className={styles.destination}>{trip.destination}</p>}
        <p>{dateLabel(trip.start_date)} – {dateLabel(trip.end_date)}</p>
        {options.costs && trip.budget != null && <p>Budget: {fmtMoney(trip.budget, trip.currency)}</p>}
        {options.notes && trip.notes && <p className={styles.notes}>{trip.notes}</p>}
      </header>
      {bookings.length === 0 && <p>No bookings yet.</p>}
      {days.map(({ date, items }) => (
        <section key={date} className={styles.day}>
          <h3>{date ? dateLabel(date) : "Plans without a date"}</h3>
          {items.map(event => {
            const booking = event.booking;
            const label = itineraryEventLabel(event);
            if (event.kind === "staying") {
              return <p key={event.id} className={styles.stayContext}>Staying at · {booking.title || booking.provider || "Accommodation"}</p>;
            }
            return (
              <section key={event.id} className={styles.booking}>
                <div className={styles.bookingHeading}>
                  <h4>{label || TYPE_META[booking.type].label} · {booking.title || TYPE_META[booking.type].label}</h4>
                  <span>{statuses[booking.status]}</span>
                </div>
                {booking.provider && <p>{booking.provider}</p>}
                {booking.type === "flight" ? (
                  <>
                    {bookingFlightLegs(booking).map((leg, index, legs) => (event.legIndex == null || index === event.legIndex) && (
                      <div key={index} className={styles.leg}>
                        <p><strong>{leg.from_place || "Departure airport"} → {leg.to_place || "Arrival airport"}</strong></p>
                        <p>Departs: {dateTime(leg.departure_date, leg.departure_time)}</p>
                        <p>Arrives: {dateTime(leg.arrival_date, leg.arrival_time)}</p>
                        {(leg.flight_number || leg.seat) && <p>{[leg.flight_number && `Flight ${leg.flight_number}`, leg.seat && `Seat ${leg.seat}`].filter(Boolean).join(" · ")}</p>}
                        {index < legs.length - 1 && <p className={styles.connection}>Connection in {leg.to_place || "connecting airport"}</p>}
                      </div>
                    ))}
                    <p className={styles.localTimes}>All flight times are local to each airport.</p>
                  </>
                ) : (
                  <>
                    {(booking.from_place || booking.to_place) && <p>{[booking.from_place, booking.to_place].filter(Boolean).join(" → ")}</p>}
                    {booking.type === "stay" ? (
                      <>
                        <p>{event.kind === "check-out" ? "Check-out" : "Check-in"}: {dateTime(event.date, event.time)}</p>
                        {event.kind === "check-in" && <p>Check-out: {booking.ends_at ? dateTime(booking.ends_at.slice(0, 10), stayTimes(booking).checkOut) : "To be confirmed"}</p>}
                      </>
                    ) : booking.time && <p>Time: {booking.time.slice(0, 5)}</p>}
                    {booking.seat && <p>Seat: {booking.seat}</p>}
                  </>
                )}
                {options.references && booking.reference && <p>Confirmation: {booking.reference}</p>}
                {options.costs && event.primary && booking.cost != null && <p>Cost: {fmtMoney(booking.cost, booking.currency || trip.currency)}</p>}
                {options.notes && booking.notes && <p className={styles.notes}>{booking.notes}</p>}
              </section>
            );
          })}
        </section>
      ))}
      <footer className={styles.footer}>Travel itinerary · {trip.name}</footer>
    </article>
  );
}
