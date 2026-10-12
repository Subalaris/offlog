"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { todayStr } from "@/lib/format";
import type { Visit } from "@/lib/types";
import type { CityCandidate } from "@/lib/cityLookup";
import { MAP_TILE_DAILY_LIMIT, MAP_TILE_WARNING_AT, MAP_USAGE_KEY, reserveMapTile, validMapCoordinates, visitedPlaces } from "@/lib/visitedMap";
import { lookupPlaceLocation, savePlaceLocation } from "./mapActions";

export default function VisitedMap({ visits }: { visits: Visit[] }) {
  const today = todayStr();
  const groups = useMemo(() => visitedPlaces(visits, today), [visits, today]);
  const mapped = groups.filter(({ place }) => validMapCoordinates(place.latitude, place.longitude));
  const missing = groups.filter(({ place }) => !validMapCoordinates(place.latitude, place.longitude));
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const selectionRef = useRef<L.CircleMarker | null>(null);
  const selectedRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [used, setUsed] = useState(0);
  const [tileWarning, setTileWarning] = useState("");
  const [message, setMessage] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CityCandidate[]>([]);
  const [point, setPoint] = useState<[number, number] | null>(null);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [pending, startTransition] = useTransition();
  selectedRef.current = selectedId;
  const selected = groups.find(({ place }) => place.id === selectedId)?.place;

  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, { center: [20, 0], zoom: 2, minZoom: 2, maxZoom: 12,
      scrollWheelZoom: false, worldCopyJump: true, preferCanvas: true });
    mapRef.current = map;
    markersRef.current = L.layerGroup().addTo(map);
    let memoryUsage: string | null = null;
    let storageAvailable = true;
    class BudgetTileLayer extends L.TileLayer {
      createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
        let raw = memoryUsage;
        if (storageAvailable) {
          try { raw = localStorage.getItem(MAP_USAGE_KEY); } catch { storageAvailable = false; }
        }
        const reservation = reserveMapTile(raw, new Date().toISOString().slice(0, 10));
        memoryUsage = reservation.value;
        if (storageAvailable) {
          try { localStorage.setItem(MAP_USAGE_KEY, reservation.value); } catch { storageAvailable = false; }
        }
        setUsed(reservation.used);
        if (!reservation.allowed) {
          setTileWarning("Map imagery paused: this browser reached Offlog’s 300 tile attempts for today. It resets at midnight UTC. Your saved places are still available.");
          const tile = document.createElement("div");
          setTimeout(() => done(undefined, tile), 0);
          return tile;
        }
        if (!storageAvailable) setTileWarning("Browser storage is unavailable. The imagery allowance applies only while this map stays open.");
        return super.createTile(coords, done);
      }
    }
    const tiles = new BudgetTileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 12, keepBuffer: 0, updateWhenIdle: true, updateWhenZooming: false,
      referrerPolicy: "strict-origin-when-cross-origin",
    });
    let errors = 0;
    tiles.on("tileerror", () => {
      errors += 1;
      if (errors >= 3) {
        // Stop fetching after repeated failures; no automatic retry loop.
        map.removeLayer(tiles);
        setTileWarning("Map imagery is unavailable or requests were blocked. Downloads have stopped. Use the place list for now and try again later.");
      }
    });
    // Fit saved places before enabling imagery, avoiding a second initial download.
    const initial = groups.filter(({ place }) => validMapCoordinates(place.latitude, place.longitude));
    if (initial.length) map.fitBounds(initial.map(({ place }) => [place.latitude!, place.longitude!] as [number, number]), { padding: [35, 35], maxZoom: 8 });
    tiles.addTo(map);
    map.on("click", (event: L.LeafletMouseEvent) => {
      if (!selectedRef.current) return;
      const lat = Math.max(-90, Math.min(90, event.latlng.lat));
      const lng = ((event.latlng.lng + 180) % 360 + 360) % 360 - 180;
      const rounded: [number, number] = [Number(lat.toFixed(5)), Number(lng.toFixed(5))];
      setPoint(rounded); setLatitude(String(rounded[0])); setLongitude(String(rounded[1]));
    });
    const resize = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resize.observe(container.current);
    setReady(true);
    return () => { resize.disconnect(); map.remove(); mapRef.current = null; markersRef.current = null; selectionRef.current = null; };
    // Mount only when the Map tab opens; later data changes update markers without fetching a new base layer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const layer = markersRef.current;
    if (!ready || !layer) return;
    layer.clearLayers();
    for (const { place, visits: entries, pastVisits, futureVisits } of mapped) {
      const futureOnly = pastVisits === 0;
      const mixed = pastVisits > 0 && futureVisits > 0;
      const status = futureOnly ? "Future" : mixed ? "Visited + future" : "Visited";
      const popup = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = `${place.city}, ${place.country}`;
      popup.append(title);
      const count = document.createElement("p");
      count.textContent = `${pastVisits} visited · ${futureVisits} future`;
      popup.append(count);
      for (const visit of entries) {
        const row = document.createElement("p");
        const dates = visit.start_date === visit.end_date ? visit.start_date : `${visit.start_date} – ${visit.end_date}`;
        row.textContent = `${visit.start_date > today ? "Future" : "Visited"} · ${dates}`;
        if (visit.trip_id) {
          const link = document.createElement("a");
          link.href = `/trips/${encodeURIComponent(visit.trip_id)}`; link.textContent = " · View trip";
          row.append(link);
        }
        popup.append(row);
      }
      L.circleMarker([place.latitude!, place.longitude!], {
        radius: 7, color: futureVisits > 0 ? "#7c3aed" : "#0e7490", weight: mixed ? 3 : 2,
        fillColor: futureOnly ? "#a78bfa" : "#22d3ee", fillOpacity: .9,
      }).bindPopup(popup, { maxHeight: 220 }).bindTooltip(`${title.textContent} · ${status}`).addTo(layer);
    }
  }, [groups, ready, today]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    selectionRef.current?.remove();
    selectionRef.current = point ? L.circleMarker(point, { radius: 9, color: "#fbbf24", fillOpacity: .8 }).addTo(map) : null;
  }, [point, ready]);

  function choosePoint(lat: number, lng: number) {
    if (!validMapCoordinates(lat, lng)) { setMessage("Enter latitude from −90 to 90 and longitude from −180 to 180."); return; }
    setPoint([lat, lng]); setLatitude(String(lat)); setLongitude(String(lng));
    mapRef.current?.setView([lat, lng], 8);
  }

  function selectPlace(id: string) {
    setSelectedId(id); setCandidates([]); setPoint(null); setLatitude(""); setLongitude(""); setMessage("");
    startTransition(async () => {
      try {
        const matches = await lookupPlaceLocation(id);
        setCandidates(matches);
        if (matches.length === 1) choosePoint(matches[0].latitude, matches[0].longitude);
        else if (!matches.length) setMessage("No matching city in the local database. Pin it on the map or enter its coordinates below.");
      } catch (error) { setMessage(error instanceof Error ? error.message : "Could not look up this place. You can still pin it manually."); }
    });
  }

  return (
    <section className="visited-map-section" aria-label="Visited and future places map">
      <div className="visited-map-heading">
        <p>{mapped.length} of {groups.length} {groups.length === 1 ? "place" : "places"} on the map, including future visits.</p>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!mapped.length} onClick={() => mapRef.current?.fitBounds(mapped.map(({ place }) => [place.latitude!, place.longitude!] as [number, number]), { padding: [35, 35], maxZoom: 8 })}>Show all places</button>
      </div>
      <div className="visited-map-legend" aria-label="Map marker colors">
        <span><i className="visited-map-dot" aria-hidden="true" />Visited</span>
        <span><i className="visited-map-dot future" aria-hidden="true" />Future</span>
        <span><i className="visited-map-dot mixed" aria-hidden="true" />Visited + future</span>
      </div>
      <div ref={container} className={`visited-map ${selectedId ? "visited-map-picking" : ""}`} role="region" aria-label="Interactive map of visited and future cities" />
      {tileWarning && <p className="visited-map-warning" role="status">{tileWarning}</p>}
      {!tileWarning && used >= MAP_TILE_WARNING_AT && <p className="visited-map-warning" role="status">You’re nearing Offlog’s daily imagery allowance ({used}/{MAP_TILE_DAILY_LIMIT} tile attempts). Further downloads pause at {MAP_TILE_DAILY_LIMIT} until midnight UTC.</p>}
      <details className="visited-map-usage">
        <summary>Free map usage · {used}/{MAP_TILE_DAILY_LIMIT} tile attempts today in this browser</summary>
        <p>City lookups use bundled data and have no external API quota. Coordinates are saved for repeat visits. Imagery loads only while this map is open, with normal browser caching and no offline downloads.</p>
        <p>The {MAP_TILE_DAILY_LIMIT} allowance is Offlog’s precaution per browser, not a provider quota or guarantee. OpenStreetMap publishes no fixed free allowance and may restrict heavy usage across the app. Multiple browsers have separate counters.</p>
        <a href="https://operations.osmfoundation.org/policies/tiles/" target="_blank" rel="noopener noreferrer">OpenStreetMap usage policy</a>
        {" · "}<a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">City data: GeoNames</a>
        {" · "}<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>
      </details>
      {groups.length === 0 && <p className="history-muted">Add a past or future visit to see it on the map.</p>}
      {missing.length > 0 && <div className="visited-map-missing">
        <h2>Places needing a location</h2>
        <p className="history-muted">Find a city locally, confirm the pin, then save it for all visits to that place.</p>
        <div className="visited-map-place-list">{missing.map(({ place }) => (
          <button type="button" className={`btn btn-ghost btn-sm ${selectedId === place.id ? "active" : ""}`} key={place.id} disabled={pending} onClick={() => selectPlace(place.id)}>{place.city}, {place.country}</button>
        ))}</div>
      </div>}
      {selected && <div className="visited-map-editor">
        <h2>Locate {selected.city}, {selected.country}</h2>
        <p className="history-muted">Choose a match or click the map to place the pin. Check the location before saving.</p>
        {candidates.length > 1 && <div className="visited-map-place-list">{candidates.map((candidate) => <button key={candidate.id} type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => choosePoint(candidate.latitude, candidate.longitude)}>{candidate.name}, {candidate.country}{candidate.region ? ` (${candidate.region})` : ""} · {candidate.latitude.toFixed(3)}, {candidate.longitude.toFixed(3)}</button>)}</div>}
        <div className="visited-map-coordinates">
          <label className="field">Latitude<input type="number" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} disabled={pending} /></label>
          <label className="field">Longitude<input type="number" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} disabled={pending} /></label>
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending || !latitude.trim() || !longitude.trim()} onClick={() => choosePoint(Number(latitude), Number(longitude))}>Preview pin</button>
        </div>
        {message && <p className="history-muted" role="status">{message}</p>}
        <div className="visited-map-place-list">
          <button type="button" className="btn btn-primary btn-sm" disabled={pending || !point || !latitude.trim() || !longitude.trim() || Number(latitude) !== point[0] || Number(longitude) !== point[1]} onClick={() => {
            if (!point || !selectedId) return;
            setMessage("");
            startTransition(async () => {
              try { await savePlaceLocation(selectedId, point[0], point[1]); setSelectedId(null); setPoint(null); }
              catch (error) { setMessage(error instanceof Error ? error.message : "Could not save this location."); }
            });
          }}>{pending ? "Working…" : "Save location"}</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => { setSelectedId(null); setPoint(null); }}>Cancel</button>
        </div>
      </div>}
    </section>
  );
}
