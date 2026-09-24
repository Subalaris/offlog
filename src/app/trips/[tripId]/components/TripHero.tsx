
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { Trip } from "@/lib/types";
import { fmtRange, nightsBetween, airportCode, cityName } from "@/lib/format";
import { updateTrip, deleteTripAction } from "@/app/actions";

export function TripHero({ trip }: { trip: Trip }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <>
      <header className="topbar" style={{ marginBottom: 20 }}>
        <div className="greeting">
          <Link href="/" style={{ color: "var(--muted)", fontSize: 12.5, textDecoration: "none" }}>
            ← All trips
          </Link>
          <h1>{trip.name}</h1>
          <p>
            {fmtRange(trip.start_date, trip.end_date)}
            {trip.destination ? ` · ${trip.destination}` : ""} · {nightsBetween(trip.start_date, trip.end_date)} nights
          </p>
        </div>
        <div className="top-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)} disabled={pending}>
            {open ? "Hide edit" : "Edit trip"}
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={async () => {
              if (confirm(`Delete "${trip.name}" and everything inside it? This cannot be undone.`)) {
                await deleteTripAction(trip.id);
              }
            }}
          >
            Delete
          </button>
        </div>
      </header>

      {open && (
        <section className="card" style={{ marginBottom: 22 }}>
          <div className="card-header">
            <div className="card-label">Edit trip</div>
            <button className="modal-x" style={{ fontSize: 20 }} onClick={() => setOpen(false)} disabled={pending}>×</button>
          </div>
          <form action={(fd) => start(() => updateTrip(trip.id, fd))} className="form-grid">
            <label className="field span-2">
              Name
              <input name="name" defaultValue={trip.name} required />
            </label>
            <label className="field">
              Destination
              <input name="destination" defaultValue={trip.destination} />
            </label>
            <label className="field">
              Budget
              <input name="budget" type="number" min="0" step="0.01" defaultValue={trip.budget ?? ""} />
            </label>
            <label className="field">
              Start
              <input name="start_date" type="date" defaultValue={trip.start_date} required />
            </label>
            <label className="field">
              End
              <input name="end_date" type="date" defaultValue={trip.end_date} required />
            </label>
            <label className="field span-2">
              Notes
              <textarea name="notes" rows={2} defaultValue={trip.notes} />
            </label>
            <div className="span-2">
              <button className="btn btn-primary" disabled={pending}>
                {pending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
