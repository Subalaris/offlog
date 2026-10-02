
"use client";

import { useMemo } from "react";
import type { Trip, Booking } from "@/lib/types";
import { TYPE_META } from "@/lib/types";
import { fmtMD, fmtDate, fmtMoney, fmtRange, nightsBetween, todayStr } from "@/lib/format";
import { BookingEditor } from "./BookingEditor";
import { bookingFlightLegs } from "@/lib/flights";

const STATUS_CHIP: Record<Booking["status"], string> = {
  booked: "chip-booked",
  pending: "chip-pending",
  done: "chip-done",
};
const STATUS_LABEL: Record<Booking["status"], string> = {
  booked: "Booked",
  pending: "Pending",
  done: "Done",
};

function FlightJourney({ booking }: { booking: Booking }) {
  if (booking.type !== "flight") return null;
  const legs = bookingFlightLegs(booking);
  return (
    <div className="flight-journey">
      {legs.map((leg, index) => (
        <div className="flight-journey-leg" key={index}>
          <div className="flight-leg-route">{leg.from_place || "Departure"} → {leg.to_place || "Arrival"}</div>
          {(leg.departure_date || leg.departure_time || leg.arrival_date || leg.arrival_time) && (
            <div className="flight-leg-times">
              <span>Departs {[leg.departure_date && fmtDate(leg.departure_date), leg.departure_time].filter(Boolean).join(" · ") || "—"}</span>
              <span>Arrives {[leg.arrival_date && fmtDate(leg.arrival_date), leg.arrival_time].filter(Boolean).join(" · ") || "—"}</span>
            </div>
          )}
          {(leg.flight_number || leg.seat) && <div className="flight-leg-details">{[leg.flight_number, leg.seat && `Seat ${leg.seat}`].filter(Boolean).join(" · ")}</div>}
          {index < legs.length - 1 && <div className="flight-connection-label">Connection in {leg.to_place || "connecting airport"}</div>}
        </div>
      ))}
      {legs.some((leg) => leg.departure_time || leg.arrival_time) && <div className="flight-local-times">All times are local to each airport</div>}
    </div>
  );
}

export function Timeline({ trip, bookings }: { trip: Trip; bookings: Booking[] }) {
  const today = todayStr();

  const days = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of bookings) {
      if (!b.date) continue;
      if (!map.has(b.date)) map.set(b.date, []);
      map.get(b.date)!.push(b);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => ({
        date,
        items: items.sort((x, y) => (x.time || "00").localeCompare(y.time || "00")),
      }));
  }, [bookings]);

  const undated = bookings.filter((b) => !b.date);
  const isLast = (i: number) => i === days.length - 1 && undated.length === 0;

  return (
    <article className="card">
      <div className="card-header">
        <div className="card-label">Itinerary</div>
        <BookingEditor trip={trip} mode="new" />
      </div>

      {days.length === 0 && undated.length === 0 && (
        <div className="empty">
          No bookings yet. Add your first flight or stay and it will land here, in order.
        </div>
      )}

      <div className="timeline">
        {days.map((d, i) => (
          <div className="timeline-item" key={d.date}>
            <div className="timeline-date">
              {fmtMD(d.date)}
              {d.date === today && (
                <div style={{ color: "var(--cyan)", marginTop: 2 }}>TODAY</div>
              )}
            </div>
            <div className="timeline-line">
              <div className={`timeline-dot ${d.date < today ? "dim" : ""}`} />
            </div>
            <div className="tl-items">
              {d.items.map((b) => {
                const meta = TYPE_META[b.type];
                const sub = [
                  b.type !== "flight" ? [b.from_place, b.to_place].filter(Boolean).join(" → ") : "",
                  b.type !== "flight" && b.seat ? `seat ${b.seat}` : "",
                  b.reference ? `ref ${b.reference}` : "",
                  b.type !== "flight" ? b.time : "",
                ].filter(Boolean).join(" · ");
                return (
                  <div className="tl-row" key={b.id}>
                    <div className="timeline-content">
                      <strong style={{ opacity: d.date < today ? 0.65 : 1 }}>
                        {meta.glyph} {b.title || meta.label}
                      </strong>
                      <p>
                        {b.provider || (b.type === "stay" ? (trip.destination || "") : "")}
                        {sub ? ` · ${sub}` : ""}
                        {b.type === "stay" && b.ends_at
                          ? ` · Check-out ${fmtDate(b.ends_at)} (${nightsBetween(b.date, b.ends_at)} nights)`
                          : ""}
                      </p>
                      <FlightJourney booking={b} />
                    </div>
                    <div className="tl-side">
                      {b.cost != null && (
                        <span className="tl-cost">{fmtMoney(b.cost, b.currency || trip.currency)}</span>
                      )}
                      <span className={`chip ${STATUS_CHIP[b.status]}`}>
                        {STATUS_LABEL[b.status]}
                      </span>
                      <BookingEditor trip={trip} mode="edit" booking={b} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {undated.length > 0 && (
          <div className="timeline-item">
            <div className="timeline-date">NO DATE</div>
            <div className="timeline-line">
              <div className="timeline-dot dim" />
            </div>
            <div className="tl-items">
              {undated.map((b) => {
                const meta = TYPE_META[b.type];
                return (
                  <div className="tl-row" key={b.id}>
                    <div className="timeline-content">
                      <strong>
                        {meta.glyph} {b.title || meta.label}
                      </strong>
                      <p>
                        {b.type === "flight" ? [b.provider, b.reference && `ref ${b.reference}`].filter(Boolean).join(" · ") : [b.from_place, b.to_place].filter(Boolean).join(" → ") || b.provider}
                      </p>
                      <FlightJourney booking={b} />
                    </div>
                    <div className="tl-side">
                      {b.cost != null && (
                        <span className="tl-cost">{fmtMoney(b.cost, b.currency || trip.currency)}</span>
                      )}
                      <BookingEditor trip={trip} mode="edit" booking={b} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
