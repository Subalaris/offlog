import type { Place, Visit } from "./types";

export const MAP_TILE_DAILY_LIMIT = 300;
export const MAP_TILE_WARNING_AT = 240;
export const MAP_USAGE_KEY = "offlog-map-usage-v1";

export function validMapCoordinates(latitude: unknown, longitude: unknown): boolean {
  return typeof latitude === "number" && Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && typeof longitude === "number" && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
}

export interface MapPlace {
  place: Place;
  visits: Visit[];
  pastVisits: number;
  futureVisits: number;
}

export function visitedPlaces(visits: Visit[], today: string): MapPlace[] {
  const groups = new Map<string, MapPlace>();
  for (const visit of visits) {
    const group = groups.get(visit.place_id) ?? { place: visit.place, visits: [], pastVisits: 0, futureVisits: 0 };
    group.visits.push(visit);
    if (visit.start_date > today) group.futureVisits += 1;
    else group.pastVisits += 1;
    groups.set(visit.place_id, group);
  }
  return Array.from(groups.values()).sort((a, b) => a.place.city.localeCompare(b.place.city));
}

// This is our conservative browser allowance, not an OSM quota. Count attempts,
// including browser-cache hits, and reserve before a tile can start downloading.
export function reserveMapTile(raw: string | null, day: string) {
  let used = 0;
  try {
    const previous = JSON.parse(raw || "null");
    if (previous?.day === day && Number.isSafeInteger(previous.used) && previous.used >= 0) used = previous.used;
  } catch { /* An invalid stored value starts a fresh allowance. */ }
  const allowed = used < MAP_TILE_DAILY_LIMIT;
  if (allowed) used += 1;
  return { allowed, used, value: JSON.stringify({ day, used }) };
}
