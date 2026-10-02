
"use client";

import { useState, useTransition } from "react";
import type { Booking, Trip, BookingType } from "@/lib/types";
import { createBooking, updateBookingAction, deleteBookingAction } from "@/app/actions";
import { addFlightConnection, bookingFlightLegs, removeFlightLeg, updateFlightLeg } from "@/lib/flights";

interface Props {
  trip: Trip;
  mode: "new" | "edit";
  booking?: Booking;
  onDone?: () => void;
}

const TYPE_OPTIONS: { value: BookingType; label: string; glyph: string }[] = [
  { value: "flight", label: "Flight", glyph: "✈" },
  { value: "stay", label: "Stay", glyph: "⌂" },
  { value: "transfer", label: "Transfer", glyph: "⇄" },
  { value: "activity", label: "Activity", glyph: "◈" },
];

const PLACEHOLDERS: Record<BookingType, { provider: string; title: string }> = {
  flight: { provider: "TAP Air Portugal", title: "Lisbon → Porto" },
  stay: { provider: "H10 Hotels", title: "H10 Villa Alva, Alvor" },
  transfer: { provider: "Uber", title: "Airport → hotel" },
  activity: { provider: "Local guide", title: "Day trip to Sintra" },
};

function BookingForm(props: Props & {
  open: boolean;
  setOpen: (b: boolean) => void;
  pending: boolean;
  start: (fn: () => void) => void;
}) {
  const { trip, mode, booking, onDone, setOpen, pending, start } = props;
  const [type, setType] = useState<BookingType>(booking?.type ?? "flight");
  const [legs, setLegs] = useState(() => bookingFlightLegs(booking));
  const [error, setError] = useState("");
  const isStay = type === "stay";
  const ph = PLACEHOLDERS[type];

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (!pending && e.target === e.currentTarget) setOpen(false);
      }}
    >
      <form
        className={`modal ${type === "flight" ? "flight-booking-modal" : ""}`}
        action={(fd) => {
          setError("");
          start(async () => {
            try {
              if (mode === "new") await createBooking(trip.id, fd);
              else await updateBookingAction(booking!.id, fd);
              setOpen(false);
              onDone?.();
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Could not save this booking.");
            }
          });
        }}
      >
        <div className="modal-head">
          <div className="modal-title">
            {mode === "new" ? "New booking" : booking?.title || "Edit booking"}
          </div>
          <button type="button" className="modal-x" onClick={() => setOpen(false)} disabled={pending}>
            ×
          </button>
        </div>

        <input type="hidden" name="trip_id" value={trip.id} />
        <input type="hidden" name="type" value={type} />
        {type === "flight" && <input type="hidden" name="flight_legs" value={JSON.stringify(legs)} />}

        <div className="form-grid">
          <label className="field span-2">
            Type
            <select value={type} disabled={pending} onChange={(e) => setType(e.target.value as BookingType)}>
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.glyph} {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            Status
            <select name="status" defaultValue={booking?.status ?? "booked"}>
              <option value="booked">Booked</option>
              <option value="pending">Pending</option>
              <option value="done">Done</option>
            </select>
          </label>

          <label className="field">
            Title
            <input name="title" defaultValue={booking?.title ?? ""} placeholder={ph.title} />
          </label>

          {type !== "flight" && (
            <>
              <label className="field">
                {isStay ? "Check-in" : "Date"}
                <input name="date" type="date" defaultValue={booking?.date ?? ""} />
              </label>
              <label className="field">
                {isStay ? "Check-out" : "Time"}
                {isStay ? (
                  <input name="ends_at" type="date" defaultValue={booking?.ends_at ?? ""} />
                ) : (
                  <input name="time" type="time" defaultValue={booking?.time ?? ""} />
                )}
              </label>
            </>
          )}

          <label className="field">
            Provider
            <input name="provider" defaultValue={booking?.provider ?? ""} placeholder={ph.provider} />
          </label>
          <label className="field">
            Confirmation code
            <input name="reference" defaultValue={booking?.reference ?? ""} placeholder="ABC123" />
          </label>

          {!isStay && type !== "flight" && (
            <>
              <label className="field">
                From
                <input name="from_place" defaultValue={booking?.from_place ?? ""} placeholder="Lisbon (LIS)" />
              </label>
              <label className="field">
                To
                <input name="to_place" defaultValue={booking?.to_place ?? ""} placeholder="Porto (OPO)" />
              </label>
            </>
          )}

          {type === "flight" && (
            <div className="span-2 flight-legs-editor">
              <p className="flight-times-note">Enter times in each airport’s local time. For overnight flights, use the arrival date shown on your ticket.</p>
              {legs.map((leg, index) => (
                <fieldset className="flight-leg-fields" key={index} disabled={pending}>
                  <legend>Flight {index + 1}</legend>
                  <div className="form-grid">
                    <label className="field">
                      From
                      <input value={leg.from_place} required={legs.length > 1} placeholder={index === 0 ? "Miami (MIA)" : "Munich (MUC)"}
                        onChange={(event) => setLegs((current) => updateFlightLeg(current, index, { from_place: event.target.value }))} />
                    </label>
                    <label className="field">
                      To
                      <input value={leg.to_place} required={legs.length > 1} placeholder={index === legs.length - 1 ? "Zagreb (ZAG)" : "Munich (MUC)"}
                        onChange={(event) => setLegs((current) => updateFlightLeg(current, index, { to_place: event.target.value }))} />
                    </label>
                    <label className="field">
                      Departure date
                      <input type="date" value={leg.departure_date}
                        onChange={(event) => setLegs((current) => updateFlightLeg(current, index, { departure_date: event.target.value }))} />
                    </label>
                    <label className="field">
                      Departure time
                      <input type="time" value={leg.departure_time}
                        onChange={(event) => setLegs((current) => updateFlightLeg(current, index, { departure_time: event.target.value }))} />
                    </label>
                    <label className="field">
                      Arrival date
                      <input type="date" value={leg.arrival_date}
                        onChange={(event) => setLegs((current) => updateFlightLeg(current, index, { arrival_date: event.target.value }))} />
                    </label>
                    <label className="field">
                      Arrival time
                      <input type="time" value={leg.arrival_time}
                        onChange={(event) => setLegs((current) => updateFlightLeg(current, index, { arrival_time: event.target.value }))} />
                    </label>
                    <label className="field">
                      Flight number
                      <input value={leg.flight_number} placeholder="LH461"
                        onChange={(event) => setLegs((current) => updateFlightLeg(current, index, { flight_number: event.target.value }))} />
                    </label>
                    <label className="field">
                      Seat
                      <input value={leg.seat} placeholder="14C"
                        onChange={(event) => setLegs((current) => updateFlightLeg(current, index, { seat: event.target.value }))} />
                    </label>
                  </div>
                  {index > 0 && <button type="button" className="btn btn-ghost btn-sm flight-remove-connection"
                    onClick={() => setLegs((current) => removeFlightLeg(current, index))}>Remove connection</button>}
                </fieldset>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" disabled={pending || legs.length >= 10}
                onClick={() => setLegs((current) => addFlightConnection(current))}>+ Add connection</button>
            </div>
          )}

          <label className="field">
            Cost ({trip.currency})
            <input name="cost" type="number" min="0" step="0.01" defaultValue={booking?.cost ?? ""} />
          </label>

          <label className="field span-2">
            Notes
            <textarea name="notes" rows={2} defaultValue={booking?.notes ?? ""} placeholder="Baggage allowance, dietary needs, anything else…" />
          </label>
        </div>

        {error && <p className="auth-error booking-form-error" role="alert">{error}</p>}
        <div className="modal-foot">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save booking"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </button>
          {mode === "edit" && (
            <button
              type="button"
              className="btn btn-danger"
              style={{ marginLeft: "auto" }}
              onClick={async () => {
                if (confirm("Delete this booking?")) {
                  await deleteBookingAction(trip.id, booking!.id);
                  onDone?.();
                }
              }}
              disabled={pending}
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export function BookingEditor(props: Props) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const { trip, mode, booking, onDone } = props;

  if (!open) {
    if (mode === "new") {
      return (
        <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
          + Add booking
        </button>
      );
    }
    return (
      <div className="tl-actions" title="Edit">
        <button className="icon-btn" onClick={() => setOpen(true)} title="Edit booking">
          ✎
        </button>
      </div>
    );
  }

  return <BookingForm {...props} open={open} setOpen={setOpen} pending={pending} start={start} />;
}
