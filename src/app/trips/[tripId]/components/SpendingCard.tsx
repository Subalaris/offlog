
import type { Trip, Booking } from "@/lib/types";
import { TYPE_META } from "@/lib/types";
import { fmtMoney } from "@/lib/format";

const COLORS: Record<string, string> = {
  flight: "var(--cyan)",
  stay: "var(--cyan-dark)",
  transfer: "var(--green)",
  activity: "var(--yellow)",
};

export function SpendingCard({ trip, bookings }: { trip: Trip; bookings: Booking[] }) {
  const total = bookings.reduce((s, b) => s + (b.cost || 0), 0);
  const byType: Record<string, { n: number; cost: number }> = {};
  for (const b of bookings) {
    byType[b.type] = byType[b.type] || { n: 0, cost: 0 };
    byType[b.type].n++;
    byType[b.type].cost += b.cost || 0;
  }
  const rows = Object.entries(byType)
    .filter(([, v]) => v.cost > 0)
    .sort((a, b) => b[1].cost - a[1].cost);

  const booked = bookings.filter((b) => b.status === "booked").length;
  const pending = bookings.filter((b) => b.status === "pending").length;
  const over = trip.budget != null && total > trip.budget;

  return (
    <article className="card" id="spending">
      <div className="card-header">
        <div className="card-label">Trip spending</div>
        <div className="card-icon">$</div>
      </div>

      <div className="expense-total">
        {total > 0 ? fmtMoney(total, trip.currency) : "—"}
        {trip.budget != null && (
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}>
            {" "}/ {fmtMoney(trip.budget, trip.currency)}
          </span>
        )}
      </div>

      {trip.budget != null && (
        <div className="expense-bar">
          <div
            style={{
              width: `${Math.min(100, (total / trip.budget) * 100)}%`,
              background: over ? "var(--pink)" : "var(--cyan)",
            }}
          />
        </div>
      )}

      {rows.length === 0 ? (
        <div className="expense-list">
          <div className="expense-row">
            <span>Nothing spent yet</span>
            <strong>—</strong>
          </div>
        </div>
      ) : (
        <div className="expense-list">
          <div className="expense-bar" style={{ marginBottom: 12, opacity: .9 }}>
            {rows.map(([type, v]) => (
              <div
                key={type}
                style={{ width: `${(v.cost / total) * 100}%`, background: COLORS[type] }}
              />
            ))}
          </div>
          {rows.map(([type, v]) => (
            <div className="expense-row" key={type}>
              <span>
                {TYPE_META[type as keyof typeof TYPE_META].glyph} {TYPE_META[type as keyof typeof TYPE_META].label}
                {" "}(x{v.n})
              </span>
              <strong>{fmtMoney(v.cost, trip.currency)}</strong>
            </div>
          ))}
        </div>
      )}

      {bookings.length > 0 && (
        <div className={`budget-note ${over ? "over" : ""}`}>
          {over
            ? `${fmtMoney(total - (trip.budget ?? 0), trip.currency)} over budget`
            : `${fmtMoney((trip.budget ?? 0) - total, trip.currency)} left`}
          {" · "}
          {booked} booked · {pending} pending
        </div>
      )}
    </article>
  );
}
