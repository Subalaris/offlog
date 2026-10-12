"use client";

import Link from "next/link";
import { useState } from "react";
import type { Booking, Trip } from "@/lib/types";
import { TripItinerary } from "./TripItinerary";
import styles from "./export.module.css";

export function TripExport({ trip, bookings }: { trip: Trip; bookings: Booking[] }) {
  const [costs, setCosts] = useState(false);
  const [references, setReferences] = useState(false);
  const [notes, setNotes] = useState(false);

  function print() {
    const previousTitle = document.title;
    document.title = `${trip.name} — Itinerary`;
    window.addEventListener("afterprint", () => { document.title = previousTitle; }, { once: true });
    window.print();
  }

  return (
    <div className={styles.preview}>
      <section className={styles.controls} aria-label="Export options">
        <Link href={`/trips/${trip.id}`} className={styles.back}>← Back to trip</Link>
        <h1>Export trip</h1>
        <p>Choose what to include, then select Save as PDF in your browser’s print dialog.</p>
        <fieldset>
          <legend>Include in the itinerary</legend>
          <label><input type="checkbox" checked={costs} onChange={e => setCosts(e.target.checked)} /> Costs and budget</label>
          <label><input type="checkbox" checked={references} onChange={e => setReferences(e.target.checked)} /> Confirmation codes</label>
          <label><input type="checkbox" checked={notes} onChange={e => setNotes(e.target.checked)} /> Trip and booking notes</label>
        </fieldset>
        <p className={styles.hint}>Documents aren’t included. This PDF is a snapshot; export again after changes. For a clean PDF, turn off headers and footers in the print dialog.</p>
        <button className="btn btn-primary" onClick={print}>Print / Save as PDF</button>
      </section>
      <TripItinerary trip={trip} bookings={bookings} options={{ costs, references, notes }} />
    </div>
  );
}
