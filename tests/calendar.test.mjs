import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(path, dependencies = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("require", "exports", "module", compiled)(name => dependencies[name] ?? (name.startsWith("node:") ? require(name) : {}), module.exports, module);
  return module.exports;
}
const flights = load("../src/lib/flights.ts"), stays = load("../src/lib/stays.ts");
const itinerary = load("../src/lib/itinerary.ts", { "./flights": flights, "./stays": stays });
const calendar = load("../src/lib/calendarFeed.ts", { "./types": load("../src/lib/types.ts"), "./flights": flights, "./stays": stays, "./itinerary": itinerary });
const modified = "2026-10-20T12:00:00Z";
const booking = (overrides = {}) => ({ id: "stay", type: "stay", title: "Example home", date: "2026-12-28", time: "16:00", ends_at: "2027-01-02", checkout_time: "11:00", provider: "Host", from_place: "", to_place: "", status: "booked", flight_legs: [], updated_at: modified, ...overrides });
const feed = (bookings = [booking()]) => ({ updated_at: modified, trips: [{ id: "trip", name: "Rome for New Year", destination: "Rome", updated_at: modified, bookings }] });
const render = data => calendar.renderCalendar(data, "https://offlog.example");
const unfold = body => body.replace(/\r\n /g, "");
const uids = body => [...body.matchAll(/^UID:(.+)$/gm)].map(match => match[1].trim()).sort();

test("stay markers preserve check-in/checkout dates and local times across New Year", () => {
  const text = unfold(render(feed()));
  assert.equal((text.match(/BEGIN:VEVENT/g) ?? []).length, 2);
  assert.match(text, /DTSTART;VALUE=DATE:20261228/);
  assert.match(text, /DTEND;VALUE=DATE:20261229/);
  assert.match(text, /DTSTART;VALUE=DATE:20270102/);
  assert.match(text, /Check-in: 2026-12-28 16:00/);
  assert.match(text, /Checkout: 2027-01-02 11:00/);
  assert.match(text, /URL:https:\/\/offlog.example\/trips\/trip/);
  assert.match(text, /TRANSP:TRANSPARENT/);
  assert.ok(!text.includes("TZID"));
});

test("flight connections, overnight arrivals and older single flights remain separate", () => {
  const leg = { from_place: "Miami (MIA)", to_place: "Munich (MUC)", departure_date: "2027-01-05", departure_time: "18:00", arrival_date: "2027-01-06", arrival_time: "09:00", flight_number: "LH461" };
  const flight = booking({ id: "flight", type: "flight", title: "Miami to Zagreb", ends_at: null, date: leg.departure_date, flight_legs: [leg, { ...leg, from_place: "Munich (MUC)", to_place: "Zagreb (ZAG)", departure_date: "2027-01-06", departure_time: "11:00", arrival_date: "2027-01-06", arrival_time: "12:00", flight_number: "LH1726" }] });
  const text = unfold(render(feed([flight])));
  assert.equal((text.match(/BEGIN:VEVENT/g) ?? []).length, 3);
  assert.match(text, /Flight arrival:/);
  assert.match(text, /Flight: LH461/);
  assert.match(text, /Flight: LH1726/);
  assert.match(text, /Departure: 2027-01-05 18:00/);
  const legacy = unfold(render(feed([booking({ type: "flight", ends_at: null, from_place: "MIA", to_place: "YYZ", time: "13:30" })])));
  assert.match(legacy, /Departure: 2026-12-28 13:30/);
  assert.equal((legacy.match(/BEGIN:VEVENT/g) ?? []).length, 1);
});

test("dates can change without duplicate UIDs; undated bookings and removed bookings disappear", () => {
  const original = render(feed());
  const edited = render(feed([booking({ date: "2026-12-29", title: "New title", updated_at: "2026-10-21T12:00:00Z" })]));
  assert.deepEqual(uids(original), uids(edited));
  assert.notEqual(original, edited);
  assert.match(edited, /LAST-MODIFIED:20261021T120000Z/);
  assert.ok(!render(feed([])).includes("BEGIN:VEVENT"));
  assert.ok(!render(feed([booking({ date: "", ends_at: null })])).includes("BEGIN:VEVENT"));
  assert.ok(!render(feed([booking({ date: "2026-02-30", ends_at: null })])).includes("BEGIN:VEVENT"));
});

test("Unicode folding and escaping prevent calendar injection, and sensitive details stay private", () => {
  const text = render(feed([booking({ title: "旅".repeat(100) + "\r\nBEGIN:VEVENT;Injected,Title\\", reference: "PRIVATECODE", notes: "private note", cost: 123456, seat: "PRIVATESEAT" })]));
  for (const line of text.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75);
  const unfolded = unfold(text);
  assert.ok(unfolded.includes("旅".repeat(100)));
  assert.ok(unfolded.includes("\\nBEGIN:VEVENT\\;Injected\\,Title\\\\"));
  assert.equal((unfolded.match(/^BEGIN:VEVENT$/gm) ?? []).length, 2);
  assert.ok(!/PRIVATECODE|private note|123456|PRIVATESEAT/.test(text));
  assert.ok(text.endsWith("END:VCALENDAR\r\n"));
});

function feedRoute({ data = feed(), error = null } = {}) {
  const calls = [];
  const route = load("../src/app/api/calendar/[token]/route.ts", {
    "@/lib/calendarFeed": calendar,
    "@supabase/supabase-js": { createClient: (...args) => { calls.push({ config: args[2] }); return { rpc: async (...args) => { calls.push({ rpc: args }); return { data, error }; } }; } },
  });
  return { ...route, calls };
}
const token = "a".repeat(64);
const request = (headers = {}) => new Request(`https://offlog.example/api/calendar/${token}`, { headers });

test("feed is anonymous but token-gated; failures never masquerade as an empty calendar", async () => {
  const route = feedRoute();
  assert.equal((await route.GET(request(), { params: Promise.resolve({ token: "bad" }) })).status, 404);
  assert.equal(route.calls.length, 0);
  const response = await route.GET(request(), { params: Promise.resolve({ token }) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/calendar/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(route.calls[0].config.auth.persistSession, false);
  assert.deepEqual(route.calls[1], { rpc: ["read_offlog_calendar", { p_token: token }] });
  const unchanged = await route.GET(request({ "if-none-match": response.headers.get("etag") }), { params: Promise.resolve({ token }) });
  assert.equal(unchanged.status, 304);
  assert.equal((await feedRoute({ data: null }).GET(request(), { params: Promise.resolve({ token }) })).status, 404);
  const unavailable = await feedRoute({ error: { message: "database error containing private data" } }).GET(request(), { params: Promise.resolve({ token }) });
  assert.equal(unavailable.status, 503);
  assert.ok(!(await unavailable.text()).includes("private data"));
});

test("only the token feed bypasses sign-in; other API routes remain protected", async () => {
  const { NextRequest, NextResponse } = require("next/server");
  let authChecks = 0;
  const { middleware } = load("../src/middleware.ts", {
    "next/server": { NextResponse },
    "@supabase/ssr": { createServerClient: () => ({ auth: { getUser: async () => { authChecks++; return { data: { user: null } }; } } }) },
  });
  const response = await middleware(new NextRequest(`https://offlog.example/api/calendar/${token}`));
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(authChecks, 0);
  for (const path of ["/api/calendar/bad", `/api/calendar/${token}/extra`, "/api/bookings/import"]) {
    assert.equal((await middleware(new NextRequest(`https://offlog.example${path}`))).status, 401);
  }
});

test("subscription actions bind to the signed-in owner and rotate a 256-bit token", async () => {
  const writes = [], removals = [];
  let signedIn = true, failure = null;
  const actions = load("../src/app/profile/calendarActions.ts", {
    "@/lib/auth": { requireUser: async () => { if (!signedIn) throw new Error("Sign in required"); return { id: "owner" }; } },
    "next/cache": { revalidatePath: () => {} },
    "@/lib/supabase/server": { createClient: async () => ({ from: name => { assert.equal(name, "calendar_subscriptions"); return {
      upsert: async (value, options) => { writes.push({ value, options }); return { error: failure }; },
      delete: () => ({ eq: async (...args) => { removals.push(args); return { error: failure }; } }),
    }; } }) },
  });
  const first = await actions.enableCalendarSubscription();
  const second = await actions.enableCalendarSubscription();
  assert.ok(calendar.isCalendarToken(first.token));
  assert.notEqual(first.token, second.token);
  assert.ok(writes.every(write => write.value.owner_id === "owner"));
  assert.equal((await actions.disableCalendarSubscription()).error, null);
  assert.deepEqual(removals, [["owner_id", "owner"]]);
  failure = { message: "private db error" };
  assert.equal((await actions.enableCalendarSubscription()).token, null);
  assert.ok((await actions.disableCalendarSubscription()).error);
  signedIn = false;
  await assert.rejects(actions.enableCalendarSubscription(), /Sign in required/);
  await assert.rejects(actions.disableCalendarSubscription(), /Sign in required/);
});

test("profile connection status is owner-scoped and degrades safely before migration", async () => {
  let error = null, data = { token }, owner = "";
  const query = {
    select: () => query,
    eq: (_column, value) => { owner = value; return query; },
    maybeSingle: async () => ({ data, error }),
  };
  const { getCalendarSubscription } = load("../src/lib/calendarSubscription.ts", {
    "./supabase/server": { createClient: async () => ({ from: () => query }) },
  });
  assert.deepEqual(await getCalendarSubscription("owner"), { available: true, token, error: null });
  assert.equal(owner, "owner");
  error = { code: "PGRST205", message: "schema table missing" }; data = null;
  assert.deepEqual(await getCalendarSubscription("owner"), { available: false, token: null, error: null });
  error = { code: "42501", message: "private database details" };
  const failed = await getCalendarSubscription("owner");
  assert.equal(failed.token, null);
  assert.ok(failed.error);
  assert.ok(!failed.error.includes("private database details"));
});
