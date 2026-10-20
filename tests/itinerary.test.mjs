import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

function load(file) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "exports", "module", compiled)(name => load(`../src/lib/${name.slice(2)}.ts`), module.exports, module);
  return module.exports;
}
const { buildItinerary } = load("../src/lib/itinerary.ts");
const { parseStayBooking } = load("../src/lib/stays.ts");
const trip = { start_date: "2026-12-30", end_date: "2027-01-02" };
const stay = { id: "hotel", type: "stay", date: "2026-12-30", ends_at: "2027-01-02", time: null };
const flight = (id, date, time) => ({ id, type: "flight", date, time });

test("arrival and departure days respect hotel defaults and do not mutate bookings", () => {
  const bookings = [stay, flight("home", "2027-01-02", "17:00"), flight("out", "2026-12-30", "09:00")];
  const before = JSON.stringify(bookings);
  const days = buildItinerary(bookings, trip);
  assert.deepEqual(days[0].items.map(e => [e.kind, e.time]), [["flight-departure", "09:00"], ["check-in", "15:00"]]);
  assert.deepEqual(days.at(-1).items.map(e => [e.kind, e.time]), [["check-out", "11:00"], ["flight-departure", "17:00"]]);
  assert.equal(days[1].items[0].kind, "staying");
  assert.equal(days[2].items[0].kind, "staying");
  assert.equal(days.flatMap(d => d.items).filter(e => e.primary).length, bookings.length);
  assert.equal(JSON.stringify(bookings), before);
});

test("custom hotel times take precedence and early return flights remain before check-out", () => {
  const days = buildItinerary([{ ...stay, time: "08:00:00", checkout_time: "14:30:00" }, flight("out", stay.date, "09:00"), flight("early", stay.ends_at, "07:00")], trip);
  assert.equal(days[0].items[0].kind, "check-in");
  assert.equal(days.at(-1).items[0].booking.id, "early");
  assert.equal(days.at(-1).items.at(-1).time, "14:30");
});

test("overnight flights and connections appear on their local dates", () => {
  const booking = { id: "overnight", type: "flight", date: "2026-12-30", time: "20:00", flight_legs: [
    { from_place: "New York", to_place: "London", departure_date: "2026-12-30", departure_time: "20:00", arrival_date: "2026-12-31", arrival_time: "08:00" },
    { from_place: "London", to_place: "Paris", departure_date: "2026-12-31", departure_time: "10:00", arrival_date: "2026-12-31", arrival_time: "12:00" },
  ] };
  const days = buildItinerary([booking, { ...stay, date: "2026-12-31" }], trip);
  assert.deepEqual(days[1].items.map(e => [e.kind, e.time]), [["flight-arrival", "08:00"], ["flight-departure", "10:00"], ["check-in", "15:00"]]);
  assert.equal(days.flatMap(d => d.items).filter(e => e.booking.id === booking.id && e.primary).length, 1);
});

test("missing times stay unconfirmed and undated plans appear last", () => {
  const days = buildItinerary([
    { id: "unknown", type: "activity", date: stay.date, time: null },
    { id: "undated", type: "activity", date: null, time: null }, stay,
  ], trip);
  assert.equal(days[0].items.at(-1).booking.id, "unknown");
  assert.equal(days[0].items.at(-1).time, "");
  assert.equal(days.at(-1).date, "");
  assert.equal(buildItinerary([{ ...stay, date: null, ends_at: null }])[0].items.length, 1);
});

test("stay dates and times validate on the server, including same-day stays", () => {
  const fd = new FormData();
  assert.deepEqual(parseStayBooking(fd), { time: "15:00", checkout_time: "11:00", ends_at: null });
  fd.set("date", "2026-12-30"); fd.set("ends_at", "2026-12-30");
  assert.throws(() => parseStayBooking(fd), /Check-out must be after check-in/);
  fd.set("time", "08:00"); fd.set("checkout_time", "16:00");
  assert.equal(parseStayBooking(fd).time, "08:00");
  fd.set("checkout_time", "25:00");
  assert.throws(() => parseStayBooking(fd), /valid.*time/);
  fd.set("checkout_time", "11:00"); fd.set("ends_at", "2027-02-30");
  assert.throws(() => parseStayBooking(fd), /valid.*date/);
});
