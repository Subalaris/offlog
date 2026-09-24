
"use client";

import { useMemo } from "react";
import type { Trip, Booking } from "@/lib/types";
import { TYPE_META } from "@/lib/types";
import { fmtMD, fmtDate, fmtMoney, fmtRange, nightsBetween, todayStr } from "@/lib/format";
import { BookingEditor } from "./BookingEditor";

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
                  [b.from_place, b.to_place].filter(Boolean).join(" → "),
                  b.seat ? `seat ${b.seat}` : "",
                  b.reference ? `ref ${b.reference}` : "",
                  b.time,
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
                        {[b.from_place, b.to_place].filter(Boolean).join(" → ") || b.provider}
                      </p>
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
