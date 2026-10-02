import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/visitDuplicates.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function("exports", "module", compiled)(module.exports, module);
const { findDuplicateVisitGroups, validateDuplicateRemoval } = module.exports;

function visit(id, patch = {}) {
  return {
    id, owner_id: "owner", place_id: "place", trip_id: null,
    source: "google_photos", external_id: id,
    start_date: "2026-07-01", end_date: "2026-07-04", created_at: "2026-08-01T00:00:00Z",
    place: { id: "place", city: "Lisbon", country: "Portugal" },
    ...patch,
  };
}

await test("matches across import sources and normalizes city/country spelling", () => {
  const matches = findDuplicateVisitGroups([
    visit("photos"),
    visit("timeline", { source: "google_timeline", place: { city: "  LÍSBON ", country: "PORTUGAL" } }),
  ]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].visits.length, 2);
});

await test("different dates, overlapping dates, cities, and countries remain separate", () => {
  assert.deepEqual(findDuplicateVisitGroups([
    visit("original"),
    visit("overlap", { start_date: "2026-07-02" }),
    visit("departure", { end_date: "2026-07-05" }),
    visit("another-city", { place: { city: "Porto", country: "Portugal" } }),
    visit("another-country", { place: { city: "Lisbon", country: "USA" } }),
  ]), []);
});

await test("suggests keeping trip-linked visits, then manual, then the oldest copy", () => {
  const rows = [
    visit("import-old", { created_at: "2025-01-01T00:00:00Z" }),
    visit("manual", { source: "manual" }),
    visit("linked", { source: "trip", trip_id: "trip" }),
    visit("import-new"),
  ];
  assert.deepEqual(findDuplicateVisitGroups(rows)[0].visits.map(row => row.id),
    ["linked", "manual", "import-old", "import-new"]);
});

await test("removes only requested matching copies and supports choosing a different keeper", () => {
  const rows = [visit("a"), visit("b"), visit("c")];
  assert.deepEqual(validateDuplicateRemoval(rows, [{ keepId: "b", removeIds: ["a", "a"] }]), ["a"]);
  assert.deepEqual(validateDuplicateRemoval(rows, []), []);
});

await test("rejects missing, changed, unrelated, and retained visits before deletion", () => {
  const rows = [visit("a"), visit("b"), visit("changed", { end_date: "2026-07-05" })];
  for (const selection of [
    { keepId: "missing", removeIds: ["a"] },
    { keepId: "a", removeIds: ["missing"] },
    { keepId: "a", removeIds: ["changed"] },
    { keepId: "a", removeIds: ["a"] },
  ]) assert.throws(() => validateDuplicateRemoval(rows, [selection]), /Scan for duplicates again/i);
  assert.throws(() => validateDuplicateRemoval(rows, [
    { keepId: "a", removeIds: ["b"] },
    { keepId: "b", removeIds: ["a"] },
  ]), /Scan for duplicates again/i);
});
