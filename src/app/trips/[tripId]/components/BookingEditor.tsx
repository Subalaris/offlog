
"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { Booking, Trip, BookingType } from "@/lib/types";
import { createBooking, updateBookingAction, deleteBookingAction } from "@/app/actions";
import { stayTimes } from "@/lib/stays";
import { addFlightConnection, bookingFlightLegs, removeFlightLeg, updateFlightLeg } from "@/lib/flights";

import { BookingImport } from "./BookingImport";
import type { BookingDraft } from "@/lib/bookingParser";

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
  setOpen: (b: boolean) => void;
  pending: boolean;
  start: (fn: () => void) => void;
}) {
  const { trip, mode, booking, onDone, setOpen, pending, start } = props;
  const [type, setType] = useState<BookingType>(booking?.type ?? "flight");
  const [legs, setLegs] = useState(() => bookingFlightLegs(booking));
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [draft, setDraft] = useState<BookingDraft>({});
  const [importVersion, setImportVersion] = useState(0);
  const values = { ...booking, ...draft, type };
  const isStay = type === "stay";
  const { checkIn, checkOut } = stayTimes(values.type === "stay" ? values as Booking : undefined);
  const ph = PLACEHOLDERS[type];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={`booking-dialog ${type === "flight" ? "flight-booking-dialog" : ""}`}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-busy={pending || importing}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending && !importing) setOpen(false);
      }}
      onClick={(event) => {
        if (pending || importing || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setOpen(false);
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
          <div className="modal-title" id={titleId}>
            {mode === "new" ? "New booking" : booking?.title || "Edit booking"}
          </div>
          <button type="button" className="modal-x" aria-label="Close booking" autoFocus onClick={() => setOpen(false)} disabled={pending || importing}>
            ×
          </button>
        </div>

        <input type="hidden" name="trip_id" value={trip.id} />
        <input type="hidden" name="type" value={type} />
        {type === "flight" && <input type="hidden" name="flight_legs" value={JSON.stringify(legs)} />}

        <BookingImport tripId={trip.id} disabled={pending} onBusyChange={setImporting} onImport={(parsed) => {
          setDraft(current => ({ ...current, ...parsed }));
          if (parsed.type) setType(parsed.type);
          if (parsed.flight_legs) setLegs(current => parsed.flight_legs!.map((leg, index) => ({
            ...leg, ...current[index], ...Object.fromEntries(Object.entries(leg).filter(([, value]) => value !== "")),
          } as typeof leg)));
          setImportVersion(version => version + 1);
        }} />

        <div className="form-grid" key={importVersion} onChange={(event) => {
          const target = event.target;
          if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) || !target.name) return;
          const value = target.name === "cost" ? (target.value === "" ? null : Number(target.value)) : target.value;
          setDraft(current => ({ ...current, [target.name]: value }));
        }}>
          <label className="field span-2">
            Type
            <select value={type} disabled={pending || importing} onChange={(e) => setType(e.target.value as BookingType)}>
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.glyph} {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            Status
            <select name="status" defaultValue={values.status ?? "booked"}>
              <option value="booked">Booked</option>
              <option value="pending">Pending</option>
              <option value="done">Done</option>
            </select>
          </label>

          <label className="field">
            Title
            <input name="title" defaultValue={values.title ?? ""} placeholder={ph.title} />
          </label>

          {type !== "flight" && (
            <>
              <label className="field">
                {isStay ? "Check-in date" : "Date"}
                <input name="date" type="date" defaultValue={values.date ?? ""} />
              </label>
              <label className="field">
                {isStay ? "Check-out date" : "Time"}
                {isStay ? (
                  <input key="checkout-date" name="ends_at" type="date" defaultValue={values.ends_at ?? ""} />
                ) : (
                  <input key="booking-time" name="time" type="time" defaultValue={values.time ?? ""} />
                )}
              </label>
            </>
          )}

          {isStay && (
            <>
              <label className="field">
                Check-in time
                <input key={`check-in-${type}`} name="time" type="time" defaultValue={checkIn} required />
              </label>
              <label className="field">
                Check-out time
                <input name="checkout_time" type="time" defaultValue={checkOut} required />
              </label>
              <p className="stay-times-note span-2">Times are local to the hotel. Defaults are 3:00 pm check-in and 11:00 am check-out. Change them to match your reservation.</p>
            </>
          )}

          <label className="field">
            Provider
            <input name="provider" defaultValue={values.provider ?? ""} placeholder={ph.provider} />
          </label>
          <label className="field">
            Confirmation code
            <input name="reference" defaultValue={values.reference ?? ""} placeholder="ABC123" />
          </label>

          {!isStay && type !== "flight" && (
            <>
              <label className="field">
                From
                <input name="from_place" defaultValue={values.from_place ?? ""} placeholder="Lisbon (LIS)" />
              </label>
              <label className="field">
                To
                <input name="to_place" defaultValue={values.to_place ?? ""} placeholder="Porto (OPO)" />
              </label>
            </>
          )}

          {type === "flight" && (
            <div className="span-2 flight-legs-editor">
              <p className="flight-times-note">Enter times in each airport’s local time. For overnight flights, use the arrival date shown on your ticket.</p>
              {legs.map((leg, index) => (
                <fieldset className="flight-leg-fields" key={index} disabled={pending || importing}>
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
              <button type="button" className="btn btn-ghost btn-sm" disabled={pending || importing || legs.length >= 10}
                onClick={() => setLegs((current) => addFlightConnection(current))}>+ Add connection</button>
            </div>
          )}

          <label className="field">
            Cost ({trip.currency})
            <input name="cost" type="number" min="0" step="0.01" defaultValue={values.cost ?? ""} />
          </label>

          <label className="field span-2">
            Notes
            <textarea name="notes" rows={2} defaultValue={values.notes ?? ""} placeholder="Baggage allowance, dietary needs, anything else…" />
          </label>
        </div>

        {error && <p className="auth-error booking-form-error" role="alert">{error}</p>}
        <div className="modal-foot">
          <button type="submit" className="btn btn-primary" disabled={pending || importing}>
            {pending ? "Saving…" : "Save booking"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={pending || importing}>
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
              disabled={pending || importing}
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}

export function BookingEditor(props: Props) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previouslyOpen = useRef(false);
  useEffect(() => {
    if (!open && previouslyOpen.current) triggerRef.current?.focus();
    previouslyOpen.current = open;
  }, [open]);
  const { mode, booking } = props;

  return (
    <>
      {mode === "new" ? (
        <button ref={triggerRef} className="btn btn-primary btn-sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
          + Add booking
        </button>
      ) : (
        <div className="tl-actions">
          <button ref={triggerRef} className="icon-btn booking-edit-button" onClick={() => setOpen(true)}
            title="Edit booking" aria-label={booking?.title ? `Edit booking: ${booking.title}` : "Edit booking"} aria-haspopup="dialog">
            <span aria-hidden="true">✎</span>
          </button>
        </div>
      )}
      {open && <BookingForm {...props} setOpen={setOpen} pending={pending} start={start} />}
    </>
  );
}
