import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function load(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "exports", "module", compiled)((name) => {
    if (name.endsWith(".css")) return { default: {} };
    if (name.startsWith("@/lib/")) return load(`../src/lib/${name.slice(6)}.ts`);
    return require(name);
  }, module.exports, module);
  return module.exports;
}
const { TripItinerary } = load("../src/app/trips/[tripId]/export/TripItinerary.tsx");
const trip = {
  name: "Winter <adventure>", destination: "Tokyo", start_date: "2026-12-30", end_date: "2027-01-05",
  budget: 4567, currency: "USD", notes: "PRIVATE TRIP NOTE",
};
const base = {
  type: "activity", title: "Museum", provider: "", status: "pending", reference: "SECRET-CODE",
  seat: "", from_place: "", to_place: "", cost: 321, currency: "EUR", notes: "PRIVATE BOOKING NOTE",
};
const bookings = [
  { ...base, id: "undated", title: "Undated tour", date: null, time: null },
  { ...base, id: "stay", type: "stay", title: "Hotel", date: "2026-12-31", time: "15:00:00", ends_at: "2027-01-05" },
  { ...base, id: "flight", type: "flight", title: "Outbound", date: "2026-12-30", time: "18:00:00", flight_legs: [
    { from_place: "New York", to_place: "London", departure_date: "2026-12-30", departure_time: "18:00", arrival_date: "2026-12-31", arrival_time: "06:00", flight_number: "AB123", seat: "14C" },
    { from_place: "London", to_place: "Tokyo", departure_date: "2026-12-31", departure_time: "10:00", arrival_date: "2027-01-01", arrival_time: "08:00", flight_number: "AB456", seat: "15A" },
  ] },
];
function render(options = { costs: false, references: false, notes: false }, items = bookings) {
  return renderToStaticMarkup(React.createElement(TripItinerary, { trip, bookings: items, options }));
}

test("default itinerary excludes private notes, references, and every cost", () => {
  const html = render();
  for (const secret of ["PRIVATE TRIP NOTE", "PRIVATE BOOKING NOTE", "SECRET-CODE", "321", "4,567", "Budget:", "Cost:"]) {
    assert.ok(!html.includes(secret), secret);
  }
  assert.ok(html.includes("Winter &lt;adventure&gt;"));
});

test("export options independently include their selected details", () => {
  const costs = render({ costs: true, references: false, notes: false });
  assert.ok(costs.includes("€321"));
  assert.ok(costs.includes("$4,567"));
  assert.ok(!costs.includes("SECRET-CODE"));
  assert.ok(!costs.includes("PRIVATE"));
  const references = render({ costs: false, references: true, notes: false });
  assert.ok(references.includes("SECRET-CODE"));
  assert.ok(!references.includes("Cost:"));
  const notes = render({ costs: false, references: false, notes: true });
  assert.ok(notes.includes("PRIVATE TRIP NOTE"));
  assert.ok(notes.includes("PRIVATE BOOKING NOTE"));
  assert.ok(!notes.includes("SECRET-CODE"));
});

test("itinerary preserves connections, cross-year dates, stays, and undated plans", () => {
  const before = JSON.stringify(bookings);
  const html = render();
  for (const detail of ["Connection in London", "AB123", "AB456", "14C", "15A", "1 Jan 2027", "5 Jan 2027", "Check-out:", "local to each airport", "Plans without a date"]) {
    assert.ok(html.includes(detail), detail);
  }
  assert.ok(html.indexOf("Outbound") < html.indexOf("Hotel"));
  assert.ok(html.indexOf("Hotel") < html.indexOf("Undated tour"));
  assert.equal(JSON.stringify(bookings), before);
});

test("empty trips, older single-leg flights, and zero costs can be exported", () => {
  assert.ok(render(undefined, []).includes("No bookings yet."));
  const html = render({ costs: true, references: false, notes: false }, [
    { ...base, id: "legacy", type: "flight", date: "2026-12-30", time: "18:00:00", from_place: "Paris", to_place: "Tokyo", cost: 0 },
  ]);
  assert.ok(html.includes("Paris → Tokyo"));
  assert.ok(html.includes("18:00"));
  assert.ok(html.includes("To be confirmed"));
  assert.ok(html.includes("€0"));
});
