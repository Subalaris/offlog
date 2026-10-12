import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "exports", "module", compiled)(name => dependencies[name] ?? {}, module.exports, module);
  return module.exports;
}
const profile = load("../src/lib/profile.ts", { zod: require("zod") });
function form(overrides = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ display_name: "  Marko  ", home_city: "Miami", home_country: "United States", preferred_currency: "EUR", ...overrides })) data.set(key, value);
  return data;
}

await test("existing accounts and malformed metadata use safe profile defaults", () => {
  assert.deepEqual(profile.readProfile(), { display_name: "", home_city: "", home_country: "", preferred_currency: "USD" });
  assert.equal(profile.readProfile({ display_name: {}, preferred_currency: "invalid" }).preferred_currency, "USD");
  assert.equal(profile.readProfile({ display_name: {}, preferred_currency: "EUR" }).display_name, "");
  assert.equal(profile.readProfile({ preferred_currency: "EUR" }).preferred_currency, "EUR");
});

await test("profile writes require authentication and only update allowed metadata", async () => {
  const writes = [], paths = [];
  let signedIn = true;
  const { saveProfile } = load("../src/app/profile/actions.ts", {
    "@/lib/profile": profile,
    "@/lib/auth": { requireUser: async () => { if (!signedIn) throw new Error("Sign in required"); return { id: "owner" }; } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { updateUser: async payload => { writes.push(payload); return { error: null }; } } }) },
    "next/cache": { revalidatePath: (...args) => paths.push(args) },
  });
  assert.deepEqual(await saveProfile(form({ owner_id: "another-user", role: "admin", email: "unverified@example.com" })), { error: null });
  assert.deepEqual(writes, [{ data: { display_name: "Marko", home_city: "Miami", home_country: "United States", preferred_currency: "EUR" } }]);
  assert.deepEqual(paths, [["/", "layout"]]);
  assert.ok((await saveProfile(form({ preferred_currency: "FAKE" }))).error);
  assert.ok((await saveProfile(form({ display_name: "a".repeat(81) }))).error);
  signedIn = false;
  await assert.rejects(saveProfile(form()), /Sign in required/);
  assert.equal(writes.length, 1);
});

await test("failed profile saves report the error without claiming success", async () => {
  const { saveProfile } = load("../src/app/profile/actions.ts", {
    "@/lib/profile": profile,
    "@/lib/auth": { requireUser: async () => ({ id: "owner" }) },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { updateUser: async () => ({ error: { message: "Could not update account" } }) } }) },
    "next/cache": { revalidatePath: () => assert.fail("must not revalidate on failure") },
  });
  assert.equal((await saveProfile(form())).error, "Could not update account");
});

await test("new trips use the owner's preferred currency with USD fallback", async () => {
  let metadata = { preferred_currency: "EUR" };
  const trips = [];
  const { createTrip } = load("../src/app/actions.ts", {
    "@/lib/profile": profile,
    "@/lib/auth": { requireUser: async () => ({ id: "owner", user_metadata: metadata }) },
    "@/lib/db": { uid: () => "new-trip", insertTrip: async trip => trips.push(trip) },
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: path => { assert.equal(path, "/trips/new-trip"); } },
  });
  const data = new FormData();
  data.set("name", "Zagreb"); data.set("start_date", "2026-10-10"); data.set("end_date", "2026-10-15");
  await createTrip(data);
  metadata = {};
  await createTrip(data);
  assert.deepEqual(trips.map(trip => trip.currency), ["EUR", "USD"]);
  assert.ok(trips.every(trip => trip.owner_id === "owner"));
});
