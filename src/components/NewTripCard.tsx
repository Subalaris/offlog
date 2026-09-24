
"use client";

import { useTransition } from "react";
import { createTrip } from "@/app/actions";

export function NewTripCard() {
  const [pending, start] = useTransition();
  return (
    <article className="card" style={{ padding: 22 }}>
      <div className="card-header" style={{ marginBottom: 16 }}>
        <div className="card-label">Plan a trip</div>
        <div className="card-icon">✦</div>
      </div>
      <form
        action={(fd) => start(() => createTrip(fd))}
        className="form-grid"
      >
        <label className="field span-2">
          Trip name
          <input name="name" required placeholder="Lisbon long weekend" />
        </label>
        <label className="field">
          Destination
          <input name="destination" placeholder="Lisbon, Portugal" />
        </label>
        <label className="field">
          Budget (optional)
          <input name="budget" type="number" min="0" step="0.01" placeholder="1500" />
        </label>
        <label className="field">
          Start
          <input name="start_date" type="date" required />
        </label>
        <label className="field">
          End
          <input name="end_date" type="date" required />
        </label>
        <label className="field span-2">
          Notes
          <textarea name="notes" rows={2} placeholder="Anything to remember…" />
        </label>
        <div className="span-2" style={{ display: "flex", gap: 10 }}>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Adding…" : "Create trip"}
          </button>
        </div>
      </form>
    </article>
  );
}
