export interface ImportedVisitDraft {
  id: string;
  city: string;
  country: string;
  startDate: string;
  endDate: string;
  latitude: number | null;
  longitude: number | null;
  sourceLabel: string;
  selected: boolean;
}

interface UnknownRecord { [key: string]: unknown }

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function datePart(value: unknown) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const numericTimestamp = /^\d{10,13}$/.test(raw)
    ? Number(raw) * (raw.length === 10 ? 1000 : 1)
    : raw;
  const parsed = new Date(numericTimestamp);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function hash(value: string) {
  let result = 14695981039346656037n;
  for (let i = 0; i < value.length; i += 1) {
    result ^= BigInt(value.charCodeAt(i));
    result = BigInt.asUintN(64, result * 1099511628211n);
  }
  return result.toString(36);
}

function coordinates(locationValue: unknown): [number | null, number | null] {
  const location = record(locationValue);
  const latLng = text(location.latLng || location.latlng);
  const match = latLng.match(/(?:geo:)?(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i);
  if (match) return [Number(match[1]), Number(match[2])];
  const latE7 = Number(location.latitudeE7);
  const lngE7 = Number(location.longitudeE7);
  if (Number.isFinite(latE7) && Number.isFinite(lngE7)) return [latE7 / 1e7, lngE7 / 1e7];
  const lat = Number(location.latitude ?? location.lat);
  const lng = Number(location.longitude ?? location.lng ?? location.lon);
  return [Number.isFinite(lat) ? lat : null, Number.isFinite(lng) ? lng : null];
}

function locationNames(locationValue: unknown): { city: string; country: string; label: string } {
  const location = record(locationValue);
  const address = text(location.address || location.formattedAddress);
  const city = text(location.city || location.locality);
  const country = text(location.country || location.countryName);
  if (city && country) return { city, country, label: address || `${city}, ${country}` };

  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const inferredCountry = parts.at(-1) || "";
    const inferredCity = (parts.at(-2) || "").replace(/^\d{3,6}\s+/, "");
    return { city: inferredCity, country: inferredCountry, label: address };
  }
  return { city: "", country: "", label: address || text(location.name) || "Unresolved place" };
}

function makeDraft(
  start: unknown,
  end: unknown,
  locationValue: unknown,
  stableId: string,
): ImportedVisitDraft | null {
  const startDate = datePart(start);
  const endDate = datePart(end) || startDate;
  if (!startDate) return null;
  const [latitude, longitude] = coordinates(locationValue);
  const names = locationNames(locationValue);
  const source = `${stableId}|${startDate}|${endDate}|${latitude}|${longitude}`;
  return {
    id: `google_${hash(source)}`,
    city: names.city,
    country: names.country,
    startDate,
    endDate: endDate < startDate ? startDate : endDate,
    latitude,
    longitude,
    sourceLabel: names.label,
    selected: Boolean(names.city && names.country),
  };
}

function parseSemanticSegments(root: UnknownRecord) {
  const segments = Array.isArray(root.semanticSegments) ? root.semanticSegments : [];
  return segments.flatMap((value, index) => {
    const segment = record(value);
    const visit = record(segment.visit);
    if (!Object.keys(visit).length) return [];
    const candidate = record(visit.topCandidate);
    const location = record(candidate.placeLocation);
    const enrichedLocation = {
      ...location,
      name: candidate.name,
      address: candidate.address,
      city: candidate.city,
      country: candidate.country,
    };
    const draft = makeDraft(
      segment.startTime,
      segment.endTime,
      enrichedLocation,
      text(candidate.placeId) || `semantic-${index}`,
    );
    return draft ? [draft] : [];
  });
}

function parseLegacyTimeline(root: UnknownRecord) {
  const objects = Array.isArray(root.timelineObjects) ? root.timelineObjects : [];
  return objects.flatMap((value, index) => {
    const placeVisit = record(record(value).placeVisit);
    if (!Object.keys(placeVisit).length) return [];
    const duration = record(placeVisit.duration);
    const location = record(placeVisit.location);
    const draft = makeDraft(
      duration.startTimestamp || duration.startTimestampMs,
      duration.endTimestamp || duration.endTimestampMs,
      location,
      text(location.placeId) || `legacy-${index}`,
    );
    return draft ? [draft] : [];
  });
}

function parseSimpleRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    const row = record(item);
    if (!row.city && !row.country) return [];
    const draft = makeDraft(
      row.start_date || row.startDate || row.arrival,
      row.end_date || row.endDate || row.departure,
      row,
      text(row.id) || `row-${index}`,
    );
    return draft ? [{ ...draft, city: text(row.city), country: text(row.country), selected: true }] : [];
  });
}

export function parseGoogleTimeline(value: unknown): ImportedVisitDraft[] {
  const root = record(value);
  const drafts = [
    ...parseSemanticSegments(root),
    ...parseLegacyTimeline(root),
    ...parseSimpleRows(value),
    ...parseSimpleRows(root.visits),
  ];
  const seen = new Set<string>();
  return drafts.filter((draft) => {
    if (seen.has(draft.id)) return false;
    seen.add(draft.id);
    return true;
  }).slice(0, 2000);
}
