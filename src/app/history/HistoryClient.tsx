"use client";

import { useMemo, useState, useTransition } from "react";
import type { Trip, Visit } from "@/lib/types";
import {
  createVisitAction,
  deleteVisitAction,
  importGoogleTimelineAction,
  updateVisitAction,
} from "@/app/actions";
import { parseGoogleTimeline, type ImportedVisitDraft } from "@/lib/googleTimeline";

type View = "timeline" | "places";

interface EditorSeed {
  visit?: Visit;
  city?: string;
  country?: string;
  startDate?: string;
  endDate?: string;
  tripId?: string;
  source?: "manual" | "trip";
}

function splitDestination(destination: string) {
  const parts = destination.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return { city: destination.trim(), country: "" };
  return { city: parts.slice(0, -1).join(", "), country: parts.at(-1) || "" };
}

function dateLabel(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

function rangeLabel(start: string, end: string) {
  const startYear = start.slice(0, 4);
  const endYear = end.slice(0, 4);
  if (start === end) return dateLabel(start, { month: "short", day: "numeric", year: "numeric" });
  const first = dateLabel(start, {
    month: "short",
    day: "numeric",
    ...(startYear !== endYear ? { year: "numeric" } : {}),
  });
  return `${first}–${dateLabel(end, { month: "short", day: "numeric", year: "numeric" })}`;
}

function durationLabel(start: string, end: string) {
  const days = Math.round(
    (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86400000,
  );
  return days === 0 ? "Day visit" : `${days} ${days === 1 ? "night" : "nights"}`;
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const groupKey = key(item);
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), item]);
  }
  return groups;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function distanceKm(a: ImportedVisitDraft, b: ImportedVisitDraft) {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return Infinity;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function consolidateImportedVisits(rows: ImportedVisitDraft[]) {
  const grouped = groupBy(rows, (row) => `${row.city.trim().toLowerCase()}|${row.country.trim().toLowerCase()}`);
  return Array.from(grouped.values()).flatMap((group) => {
    const sorted = [...group].sort((a, b) => a.startDate.localeCompare(b.startDate));
    const stays: Array<{
      city: string;
      country: string;
      startDate: string;
      endDate: string;
      latitude: number | null;
      longitude: number | null;
      ids: string[];
    }> = [];
    for (const row of sorted) {
      const current = stays.at(-1);
      if (current && row.startDate <= addDays(current.endDate, 1)) {
        current.endDate = row.endDate > current.endDate ? row.endDate : current.endDate;
        current.ids.push(row.id);
      } else {
        stays.push({
          city: row.city.trim(),
          country: row.country.trim(),
          startDate: row.startDate,
          endDate: row.endDate,
          latitude: row.latitude,
          longitude: row.longitude,
          ids: [row.id],
        });
      }
    }
    return stays.map((stay) => ({
      city: stay.city,
      country: stay.country,
      startDate: stay.startDate,
      endDate: stay.endDate,
      latitude: stay.latitude,
      longitude: stay.longitude,
      externalId: `group_${stay.ids[0]}_${stay.ids.at(-1)}_${stay.startDate}_${stay.endDate}`,
    }));
  });
}

function VisitModal({ seed, onClose }: { seed: EditorSeed; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const visit = seed.visit;
  const place = visit?.place;

  return (
    <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <form
        className="modal"
        action={(formData) => {
          setError("");
          startTransition(async () => {
            try {
              if (visit) await updateVisitAction(visit.id, formData);
              else await createVisitAction(formData);
              onClose();
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Could not save this visit");
            }
          });
        }}
      >
        <div className="modal-head">
          <div className="modal-title">{visit ? "Edit visit" : "Add a place you visited"}</div>
          <button type="button" className="modal-x" onClick={onClose} disabled={pending}>×</button>
        </div>
        <input type="hidden" name="source" value={visit?.source || seed.source || "manual"} />
        <input type="hidden" name="trip_id" value={visit?.trip_id || seed.tripId || ""} />
        <input type="hidden" name="latitude" value={place?.latitude ?? ""} />
        <input type="hidden" name="longitude" value={place?.longitude ?? ""} />
        <div className="form-grid">
          <label className="field">
            City
            <input name="city" required defaultValue={place?.city || seed.city || ""} placeholder="Porto" />
          </label>
          <label className="field">
            Country
            <input name="country" required defaultValue={place?.country || seed.country || ""} placeholder="Portugal" />
          </label>
          <label className="field">
            Arrival
            <input name="start_date" type="date" required defaultValue={visit?.start_date || seed.startDate || ""} />
          </label>
          <label className="field">
            Departure
            <input name="end_date" type="date" required defaultValue={visit?.end_date || seed.endDate || ""} />
          </label>
        </div>
        {error && <p className="auth-error history-form-error">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save visit"}</button>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function DeleteVisitModal({ visit, onClose }: { visit: Visit; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal history-confirm-modal">
        <div className="modal-head">
          <div className="modal-title">Remove this visit?</div>
          <button type="button" className="modal-x" onClick={onClose} disabled={pending}>×</button>
        </div>
        <p className="history-muted">
          {visit.place.city}, {visit.place.country} · {rangeLabel(visit.start_date, visit.end_date)}
        </p>
        <div className="modal-foot">
          <button
            type="button"
            className="btn btn-danger"
            disabled={pending}
            onClick={() => startTransition(async () => {
              await deleteVisitAction(visit.id);
              onClose();
            })}
          >
            {pending ? "Removing…" : "Remove visit"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<ImportedVisitDraft[]>([]);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const updateRow = (id: string, patch: Partial<ImportedVisitDraft>) => {
    setRows((current) => {
      const target = current.find((row) => row.id === id);
      if (!target) return current;
      const placePatch = "city" in patch || "country" in patch;
      return current.map((row) => {
        if (row.id !== id && (!placePatch || row.placeKey !== target.placeKey)) return row;
        const updated = { ...row, ...patch };
        return {
          ...updated,
          selected: placePatch
            ? Boolean(updated.city.trim() && updated.country.trim())
            : updated.selected,
        };
      });
    });
  };
  const validSelected = rows.filter((row) => row.selected && row.city.trim() && row.country.trim());
  const consolidatedVisits = consolidateImportedVisits(validSelected);
  const unresolved = rows.filter((row) => !row.city.trim() || !row.country.trim()).length;

  return (
    <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal history-import-modal">
        <div className="modal-head">
          <div>
            <div className="modal-title">Import Google Timeline</div>
            <p className="history-muted">The original JSON stays in this browser. Only visits you approve are saved.</p>
          </div>
          <button type="button" className="modal-x" onClick={onClose} disabled={pending}>×</button>
        </div>

        {rows.length === 0 ? (
          <div className="history-import-drop">
            <label className="field">
              Timeline JSON file
              <input
                type="file"
                accept="application/json,.json"
                onChange={async (event) => {
                  setMessage("");
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (file.size > 100 * 1024 * 1024) {
                    setMessage("This first importer supports files up to 100 MB.");
                    return;
                  }
                  try {
                    const parsed = parseGoogleTimeline(JSON.parse(await file.text()));
                    setRows(parsed);
                    if (!parsed.length) setMessage("No supported place visits were found in this JSON file.");
                  } catch {
                    setMessage("This file is not valid JSON.");
                  }
                }}
              />
            </label>
            <p className="history-import-note">
              Supports current Semantic Timeline exports, older Takeout Timeline JSON, and simple visit arrays.
              Detailed routes and raw location points are ignored.
            </p>
          </div>
        ) : (
          <>
            <div className="history-import-summary">
              <span>{rows.length} visits found</span>
              <span>{consolidatedVisits.length} city visits ready to import</span>
              {unresolved > 0 && <span className="history-warning">{unresolved} need city or country</span>}
            </div>
            <div className="history-import-list">
              {rows.map((row) => (
                <div className={`history-import-row ${row.selected ? "selected" : ""}`} key={row.id}>
                  <input
                    className="history-import-check"
                    type="checkbox"
                    checked={row.selected}
                    disabled={!row.city.trim() || !row.country.trim()}
                    onChange={(event) => updateRow(row.id, { selected: event.target.checked })}
                  />
                  <div className="history-import-fields">
                    <input
                      aria-label="City"
                      value={row.city}
                      placeholder="City required"
                      onChange={(event) => updateRow(row.id, { city: event.target.value })}
                    />
                    <input
                      aria-label="Country"
                      value={row.country}
                      placeholder="Country required"
                      onChange={(event) => updateRow(row.id, { country: event.target.value })}
                    />
                    <input aria-label="Arrival" type="date" value={row.startDate} onChange={(event) => updateRow(row.id, { startDate: event.target.value })} />
                    <input aria-label="Departure" type="date" value={row.endDate} onChange={(event) => updateRow(row.id, { endDate: event.target.value })} />
                    <div className="history-import-source">
                      <small title={row.sourceLabel}>{row.sourceLabel}</small>
                      {row.latitude != null && row.longitude != null && row.city.trim() && row.country.trim() && (
                        <button
                          type="button"
                          onClick={() => setRows((current) => current.map((candidate) => {
                            if (distanceKm(row, candidate) > 30) return candidate;
                            return { ...candidate, city: row.city, country: row.country, selected: true };
                          }))}
                        >
                          Apply to locations within 30 km
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {message && <p className="auth-error history-form-error">{message}</p>}
        <div className="modal-foot">
          {rows.length > 0 && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || validSelected.length === 0}
              onClick={() => startTransition(async () => {
                try {
                  for (let index = 0; index < consolidatedVisits.length; index += 500) {
                    await importGoogleTimelineAction(consolidatedVisits.slice(index, index + 500));
                  }
                  onClose();
                } catch (caught) {
                  setMessage(caught instanceof Error ? caught.message : "Import failed");
                }
              })}
            >
              {pending ? "Importing…" : `Import ${consolidatedVisits.length} visits`}
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function TimelineView({ visits, onEdit, onDelete }: {
  visits: Visit[];
  onEdit: (visit: Visit) => void;
  onDelete: (visit: Visit) => void;
}) {
  const years = Array.from(groupBy(visits, (visit) => visit.start_date.slice(0, 4)));
  return (
    <div className="travel-timeline">
      {years.map(([year, yearVisits]) => (
        <section className="travel-year" key={year}>
          <h2>{year}</h2>
          <div className="travel-year-visits">
            {yearVisits.map((visit) => (
              <article className="travel-visit" key={visit.id}>
                <div className="travel-marker"><span /></div>
                <div className="travel-visit-card">
                  <div>
                    <div className="travel-place">{visit.place.city}, {visit.place.country}</div>
                    <div className="travel-dates">{rangeLabel(visit.start_date, visit.end_date)} · {durationLabel(visit.start_date, visit.end_date)}</div>
                  </div>
                  <div className="history-row-actions">
                    <span className="history-source">{visit.source === "google_timeline" ? "Google" : visit.source}</span>
                    <button className="icon-btn" title="Edit visit" onClick={() => onEdit(visit)}>✎</button>
                    <button className="icon-btn history-delete-icon" title="Remove visit" onClick={() => onDelete(visit)}>×</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function PlacesView({ visits, onEdit }: { visits: Visit[]; onEdit: (visit: Visit) => void }) {
  const countries = useMemo(() => {
    const grouped = groupBy(visits, (visit) => visit.place.country);
    return Array.from(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [visits]);
  return (
    <div className="country-list">
      {countries.map(([country, countryVisits]) => {
        const cities = Array.from(groupBy(countryVisits, (visit) => visit.place.city))
          .sort(([a], [b]) => a.localeCompare(b));
        return (
          <section className="country-card" key={country}>
            <div className="country-head">
              <h2>{country}</h2>
              <span>{cities.length} {cities.length === 1 ? "city" : "cities"} · {countryVisits.length} {countryVisits.length === 1 ? "visit" : "visits"}</span>
            </div>
            <div className="city-list">
              {cities.map(([city, cityVisits]) => (
                <div className="city-row" key={city}>
                  <strong>{city}</strong>
                  <div className="city-visits">
                    {cityVisits.map((visit) => (
                      <button key={visit.id} onClick={() => onEdit(visit)}>{rangeLabel(visit.start_date, visit.end_date)}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function HistoryClient({ visits, tripSuggestions }: { visits: Visit[]; tripSuggestions: Trip[] }) {
  const [view, setView] = useState<View>("timeline");
  const [editor, setEditor] = useState<EditorSeed | null>(null);
  const [deleting, setDeleting] = useState<Visit | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const countries = new Set(visits.map((visit) => visit.place.country.toLocaleLowerCase())).size;
  const cities = new Set(visits.map((visit) => `${visit.place.city.toLocaleLowerCase()}|${visit.place.country.toLocaleLowerCase()}`)).size;

  return (
    <>
      <header className="topbar history-topbar">
        <div className="greeting">
          <h1>Travel History</h1>
          <p>A record of the cities and countries you&rsquo;ve experienced.</p>
        </div>
        <div className="top-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setImportOpen(true)}>Import</button>
          <button className="btn btn-primary btn-sm" onClick={() => setEditor({})}>+ Add visit</button>
        </div>
      </header>

      <section className="history-stats">
        <div><strong>{countries}</strong><span>Countries</span></div>
        <div><strong>{cities}</strong><span>Cities</span></div>
        <div><strong>{visits.length}</strong><span>Visits</span></div>
      </section>

      {tripSuggestions.length > 0 && (
        <section className="history-suggestions">
          <div>
            <strong>Add past trips to your history</strong>
            <p>Confirm the city and country before they become part of your travel record.</p>
          </div>
          <div className="suggestion-list">
            {tripSuggestions.slice(0, 4).map((trip) => {
              const place = splitDestination(trip.destination);
              return (
                <button key={trip.id} onClick={() => setEditor({
                  ...place,
                  startDate: trip.start_date,
                  endDate: trip.end_date,
                  tripId: trip.id,
                  source: "trip",
                })}>
                  <span>{trip.name}</span>
                  <small>{trip.destination || "Add a destination"} · {rangeLabel(trip.start_date, trip.end_date)}</small>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="history-toolbar">
        <div className="history-tabs" role="tablist" aria-label="Travel history view">
          <button className={view === "timeline" ? "active" : ""} onClick={() => setView("timeline")}>Timeline</button>
          <button className={view === "places" ? "active" : ""} onClick={() => setView("places")}>Places</button>
          <button disabled title="Map view is coming next">Map</button>
        </div>
      </div>

      {visits.length === 0 ? (
        <div className="empty history-empty">
          <strong>Your travel history starts here.</strong>
          <span>Add a visit, confirm a past trip, or import a Google Timeline export.</span>
        </div>
      ) : view === "timeline" ? (
        <TimelineView visits={visits} onEdit={(visit) => setEditor({ visit })} onDelete={setDeleting} />
      ) : (
        <PlacesView visits={visits} onEdit={(visit) => setEditor({ visit })} />
      )}

      {editor && <VisitModal seed={editor} onClose={() => setEditor(null)} />}
      {deleting && <DeleteVisitModal visit={deleting} onClose={() => setDeleting(null)} />}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </>
  );
}
