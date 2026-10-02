import type { Visit } from "./types";

export interface DuplicateVisitGroup {
  key: string;
  visits: Visit[];
}

export interface DuplicateVisitSelection {
  keepId: string;
  removeIds: string[];
}

function normalizePlace(value: string) {
  return value.trim().toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function duplicateKey(visit: Visit) {
  return JSON.stringify([
    normalizePlace(visit.place.city), normalizePlace(visit.place.country),
    visit.start_date, visit.end_date,
  ]);
}

function keepPriority(visit: Visit) {
  if (visit.trip_id) return 0;
  if (visit.source === "manual") return 1;
  return 2;
}

export function findDuplicateVisitGroups(visits: Visit[]): DuplicateVisitGroup[] {
  const groups = new Map<string, Visit[]>();
  for (const visit of visits) {
    const key = duplicateKey(visit);
    const group = groups.get(key) ?? [];
    group.push(visit);
    groups.set(key, group);
  }
  return Array.from(groups, ([key, matches]) => ({
    key,
    visits: [...matches].sort((a, b) => keepPriority(a) - keepPriority(b)
      || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)),
  })).filter((group) => group.visits.length > 1);
}

// Validate against freshly loaded, user-owned visits before deleting any selected rows.
export function validateDuplicateRemoval(visits: Visit[], selections: DuplicateVisitSelection[]): string[] {
  const byId = new Map(visits.map((visit) => [visit.id, visit]));
  const keepIds = new Set(selections.map((selection) => selection.keepId));
  const removeIds = new Set<string>();
  for (const selection of selections) {
    const keep = byId.get(selection.keepId);
    if (!keep) throw new Error("A visit has changed or been removed. Scan for duplicates again.");
    for (const id of selection.removeIds) {
      const visit = byId.get(id);
      if (!visit || keepIds.has(id) || duplicateKey(visit) !== duplicateKey(keep)) {
        throw new Error("The duplicate matches have changed. Scan for duplicates again.");
      }
      removeIds.add(id);
    }
  }
  return Array.from(removeIds);
}
