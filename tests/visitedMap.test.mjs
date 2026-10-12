import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path, dependencies = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "exports", "module", compiled)(name => dependencies[name] ?? {}, module.exports, module);
  return module.exports;
}
const maps = load("../src/lib/visitedMap.ts");
const lookup = load("../src/lib/cityLookup.ts");

test("imagery allowance reserves before requesting and cannot exceed the daily limit", () => {
  let raw = null;
  for (let i = 1; i <= maps.MAP_TILE_DAILY_LIMIT; i++) {
    const result = maps.reserveMapTile(raw, "2026-10-06");
    assert.equal(result.allowed, true);
    assert.equal(result.used, i);
    raw = result.value;
  }
  const blocked = maps.reserveMapTile(raw, "2026-10-06");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.used, maps.MAP_TILE_DAILY_LIMIT);
  const tomorrow = maps.reserveMapTile(blocked.value, "2026-10-07");
  assert.equal(tomorrow.allowed, true);
  assert.equal(tomorrow.used, 1);
  assert.equal(maps.reserveMapTile("bad json", "2026-10-06").used, 1);
});

test("map combines repeat visits and distinguishes visited, future, and mixed places", () => {
  const place = { id: "porto", city: "Porto" };
  const visits = [
    { id: "one", place_id: "porto", place, start_date: "2026-01-01" },
    { id: "two", place_id: "porto", place, start_date: "2026-10-06" },
    { id: "future", place_id: "paris", place: { id: "paris", city: "Paris" }, start_date: "2026-10-07" },
    { id: "return", place_id: "porto", place, start_date: "2026-12-01" },
    { id: "past", place_id: "rome", place: { id: "rome", city: "Rome" }, start_date: "2025-01-01" },
  ];
  const groups = maps.visitedPlaces(visits, "2026-10-06");
  assert.equal(groups.length, 3);
  const porto = groups.find(group => group.place.id === "porto");
  assert.equal(porto.visits.length, 3);
  assert.equal(porto.pastVisits, 2); // Includes arrival today.
  assert.equal(porto.futureVisits, 1);
  const paris = groups.find(group => group.place.id === "paris");
  assert.equal(paris.pastVisits, 0);
  assert.equal(paris.futureVisits, 1);
  const rome = groups.find(group => group.place.id === "rome");
  assert.equal(rome.pastVisits, 1);
  assert.equal(rome.futureVisits, 0);
  for (const [lat, lng] of [[NaN, 1], [Infinity, 0], [null, 0], [1, undefined], [91, 0], [0, 181], ["12", 0]]) {
    assert.equal(maps.validMapCoordinates(lat, lng), false);
  }
  assert.equal(maps.validMapCoordinates(0, 0), true);
  assert.equal(maps.validMapCoordinates(-90, 180), true);
});

test("bundled lookup finds cities within the requested country and preserves ambiguous matches", () => {
  const cities = require("all-the-cities");
  const porto = lookup.findCityCandidates(cities, "Porto", "Portugal");
  assert.ok(porto.length);
  assert.equal(porto[0].country, "Portugal");
  assert.ok(Math.abs(porto[0].latitude - 41.15) < .1);
  assert.ok(Math.abs(porto[0].longitude + 8.61) < .1);
  assert.ok(lookup.findCityCandidates(cities, "São Paulo", "Brazil").length);
  assert.ok(lookup.findCityCandidates(cities, "Sao Paulo", "Brazil").length);
  assert.ok(lookup.findCityCandidates(cities, "Springfield", "USA").length > 1);
  assert.deepEqual(lookup.findCityCandidates(cities, "Porto", "Canada"), []);
  assert.deepEqual(lookup.findCityCandidates(cities, "", "Portugal"), []);
});

function actions({ signedIn = true, databaseError = null } = {}) {
  const writes = [], filters = [], paths = [];
  const query = {
    select: () => query,
    eq: (...args) => { filters.push(args); return query; },
    single: async () => ({ data: databaseError ? null : { id: "place", city: "Porto", country: "Portugal", country_code: "PT" }, error: databaseError }),
    update: value => { writes.push(value); return query; },
  };
  const result = load("../src/app/history/mapActions.ts", {
    "@/lib/auth": { requireUser: async () => { if (!signedIn) throw new Error("Sign in required"); return { id: "owner" }; } },
    "@/lib/supabase/server": { createClient: async () => ({ from: name => { assert.equal(name, "places"); return query; } }) },
    "@/lib/cityLookup": lookup,
    "@/lib/visitedMap": maps,
    "all-the-cities": require("all-the-cities"),
    "next/cache": { revalidatePath: path => paths.push(path) },
  });
  return { ...result, writes, filters, paths };
}

test("coordinate saves and local lookups are authenticated and scoped to the place owner", async () => {
  const state = actions();
  await state.savePlaceLocation("place", 41.15, -8.61);
  assert.deepEqual(state.writes, [{ latitude: 41.15, longitude: -8.61 }]);
  assert.deepEqual(state.filters, [["id", "place"], ["owner_id", "owner"]]);
  assert.deepEqual(state.paths, ["/history"]);
  const search = actions();
  assert.ok((await search.lookupPlaceLocation("place")).length);
  assert.deepEqual(search.filters, [["id", "place"], ["owner_id", "owner"]]);
  for (const operation of [state => state.savePlaceLocation("place", 1, 1), state => state.lookupPlaceLocation("place")]) {
    const signedOut = actions({ signedIn: false });
    await assert.rejects(operation(signedOut), /Sign in required/);
    assert.equal(signedOut.writes.length, 0);
    assert.equal(signedOut.filters.length, 0);
  }
});

test("invalid coordinates and missing or foreign places cannot be saved", async () => {
  const state = actions();
  for (const point of [[NaN, 1], [91, 0], [0, -181], [null, 0]]) {
    await assert.rejects(state.savePlaceLocation("place", ...point), /valid latitude/);
  }
  assert.equal(state.writes.length, 0);
  const missing = actions({ databaseError: { message: "No owned row" } });
  await assert.rejects(missing.savePlaceLocation("foreign", 1, 1), /Could not save/);
  assert.deepEqual(missing.paths, []);
  await assert.rejects(missing.lookupPlaceLocation("foreign"), /unavailable/);
});
