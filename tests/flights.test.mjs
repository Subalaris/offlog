import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

function load(path, require = () => ({})) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "exports", "module", compiled)(require, module.exports, module);
  return module.exports;
}
const flights = load("../src/lib/flights.ts");
const { emptyFlightLeg, bookingFlightLegs, addFlightConnection, updateFlightLeg, removeFlightLeg, parseFlightLegs, flightBookingSummary } = flights;
const direct = {
  ...emptyFlightLeg(), from_place: "Miami (MIA)", to_place: "Zagreb (ZAG)",
  departure_date: "2026-10-01", departure_time: "18:00",
  arrival_date: "2026-10-02", arrival_time: "12:00", seat: "14C", flight_number: "LH461",
};

await test("existing flights retain their route, departure, and seat when edited", () => {
  const result = bookingFlightLegs({ from_place: "Miami", to_place: "Zagreb", date: "2026-10-01", time: "18:00:00", seat: "14C" });
  assert.deepEqual(result, [{ ...emptyFlightLeg(), from_place: "Miami", to_place: "Zagreb", departure_date: "2026-10-01", departure_time: "18:00", seat: "14C" }]);
  assert.equal(bookingFlightLegs()[0].departure_date, "");
});

await test("adding a connection preserves final destination and next-day arrival", () => {
  const legs = updateFlightLeg(addFlightConnection([direct]), 0, { to_place: "Munich (MUC)" });
  assert.equal(legs[0].from_place, "Miami (MIA)");
  assert.equal(legs[1].from_place, "Munich (MUC)");
  assert.equal(legs[1].to_place, "Zagreb (ZAG)");
  assert.equal(legs[1].arrival_date, "2026-10-02");
  assert.equal(legs[1].arrival_time, "12:00");
  assert.equal(legs[0].arrival_time, "");
  assert.equal(direct.to_place, "Zagreb (ZAG)");
  assert.deepEqual(flightBookingSummary(legs), { from_place: direct.from_place, to_place: direct.to_place, date: direct.departure_date, time: direct.departure_time, seat: direct.seat });
});

await test("removing a connection restores the destination and final arrival", () => {
  const legs = updateFlightLeg(addFlightConnection([direct]), 0, { to_place: "Munich" });
  assert.deepEqual(removeFlightLeg(legs, 1), [direct]);
  assert.deepEqual(removeFlightLeg([direct], 0), [direct]);
});

await test("connection airport edits stay synchronized in both directions", () => {
  const legs = updateFlightLeg(addFlightConnection([direct]), 1, { from_place: "Munich" });
  assert.equal(legs[0].to_place, "Munich");
  const triple = updateFlightLeg(addFlightConnection(legs), 1, { to_place: "Vienna" });
  assert.equal(triple[2].from_place, "Vienna");
  assert.equal(removeFlightLeg(triple, 1)[0].to_place, "Vienna");
});

await test("local-time arrivals may precede departure clocks, with valid optional dates", () => {
  const westbound = { ...direct, departure_time: "15:00", arrival_time: "13:00", arrival_date: direct.departure_date };
  assert.deepEqual(parseFlightLegs(JSON.stringify([westbound])), [westbound]);
  assert.deepEqual(parseFlightLegs(JSON.stringify([emptyFlightLeg()])), [emptyFlightLeg()]);
  assert.deepEqual(parseFlightLegs(null), []);
});

await test("rejects malformed details, impossible dates, invalid times, and disconnected routes", () => {
  for (const raw of ["bad JSON", "{}", "[]", JSON.stringify(Array(11).fill(direct)), JSON.stringify([{ ...direct, arrival_date: "2026-02-30" }]), JSON.stringify([{ ...direct, arrival_time: "24:00" }]), JSON.stringify([direct, direct]), JSON.stringify([{}])]) {
    assert.throws(() => parseFlightLegs(raw));
  }
});

await test("create and update keep all legs in one booking with one shared cost/reference", async () => {
  const inserts = [], updates = [], paths = [];
  const actions = load("../src/app/actions.ts", (name) => {
    if (name === "@/lib/flights") return flights;
    if (name === "@/lib/auth") return { requireUser: async () => ({ id: "owner" }) };
    if (name === "next/cache") return { revalidatePath: path => paths.push(path) };
    if (name === "@/lib/db") return {
      uid: () => "booking-one", getTrip: async () => ({ id: "trip" }),
      insertBooking: async booking => inserts.push(booking),
      updateBooking: async (id, patch) => updates.push({ id, patch }),
    };
    return {};
  });
  const legs = updateFlightLeg(addFlightConnection([direct]), 0, { to_place: "Munich" });
  const fd = new FormData();
  fd.set("trip_id", "trip"); fd.set("type", "flight");
  fd.set("flight_legs", JSON.stringify(legs)); fd.set("cost", "1000"); fd.set("reference", "ABC123");
  await actions.createBooking("trip", fd);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].to_place, "Zagreb (ZAG)");
  assert.equal(inserts[0].date, direct.departure_date);
  assert.equal(inserts[0].cost, 1000);
  assert.equal(inserts[0].reference, "ABC123");
  assert.deepEqual(inserts[0].flight_legs, legs);
  await actions.updateBookingAction("booking-one", fd);
  assert.deepEqual(updates[0].patch.flight_legs, legs);
  assert.ok(paths.includes("/trips/trip"));
  fd.set("type", "stay"); fd.set("date", "2026-10-02"); fd.set("ends_at", "2026-10-05");
  await actions.updateBookingAction("booking-one", fd);
  assert.deepEqual(updates[1].patch.flight_legs, []);
  assert.equal(updates[1].patch.ends_at, "2026-10-05");
});

await test("missing flight schema produces an actionable error on both create and update", async () => {
  let error = { code: "PGRST204", message: "Could not find the 'flight_legs' column of 'bookings' in the schema cache" };
  const writes = [];
  const query = {
    eq: () => query, select: () => query,
    maybeSingle: async () => ({ data: null, error }),
  };
  const db = load("../src/lib/db.ts", (name) => {
    if (name === "./supabase/server") return { createClient: async () => ({
      from: () => ({
        insert: async (booking) => { writes.push(booking); return { error }; },
        update: (patch) => { writes.push(patch); return query; },
      }),
    }) };
    return {};
  });
  await assert.rejects(db.insertBooking({ date: "", time: "" }), /database update.*migration in Supabase/);
  await assert.rejects(db.updateBooking("booking", { date: "", time: "" }), /database update.*migration in Supabase/);
  assert.equal(writes[0].date, null);
  assert.equal(writes[1].time, null);
  error = { code: "42501", message: "Permission denied" };
  await assert.rejects(db.insertBooking({ date: "", time: "" }), /Permission denied/);
});
