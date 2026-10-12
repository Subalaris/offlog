import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
function load(path, dependencies = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "exports", "module", compiled)(
    name => dependencies[name] ?? require(name), module.exports, module,
  );
  return module.exports;
}
const redirects = load("../src/lib/authRedirect.ts");
function callback(auth) {
  return load("../src/app/auth/callback/route.ts", {
    "@/lib/authRedirect": redirects,
    "@/lib/supabase/server": { createClient: async () => ({ auth }) },
  }).GET;
}

await test("email link exchanges its code once and continues to the requested trip", async () => {
  const codes = [];
  const GET = callback({ exchangeCodeForSession: async code => { codes.push(code); return { error: null }; } });
  const response = await GET(new Request("https://offlog.example/auth/callback?code=first-link&next=%2Ftrips%2Ftrip-one"));
  assert.deepEqual(codes, ["first-link"]);
  assert.equal(response.headers.get("location"), "https://offlog.example/trips/trip-one");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

await test("token hash email templates finish sign-in without a browser verifier", async () => {
  const tokens = [];
  const GET = callback({ verifyOtp: async token => { tokens.push(token); return { error: null }; } });
  const response = await GET(new Request("https://offlog.example/auth/callback?token_hash=hash&type=email"));
  assert.deepEqual(tokens, [{ token_hash: "hash", type: "email" }]);
  assert.equal(response.headers.get("location"), "https://offlog.example/");
});

await test("email change confirmations return to the profile page", async () => {
  const tokens = [];
  const GET = callback({ verifyOtp: async token => { tokens.push(token); return { error: null }; } });
  const response = await GET(new Request("https://offlog.example/auth/callback?token_hash=change&type=email_change&next=%2Fprofile"));
  assert.deepEqual(tokens, [{ token_hash: "change", type: "email_change" }]);
  assert.equal(response.headers.get("location"), "https://offlog.example/profile");
});

await test("expired links return a recoverable error without leaking credentials", async () => {
  const GET = callback({ exchangeCodeForSession: async () => ({ error: { message: "private provider detail" } }) });
  const response = await GET(new Request("https://offlog.example/auth/callback?code=secret&next=%2Ftrips%2Fone"));
  const location = new URL(response.headers.get("location"));
  assert.equal(location.pathname, "/login");
  assert.equal(location.searchParams.get("error"), "email_link");
  assert.equal(location.searchParams.get("next"), "/trips/one");
  assert.equal(location.searchParams.has("code"), false);
  assert.ok(!location.href.includes("secret"));
});

await test("redirect destinations reject external URLs and login loops", () => {
  for (const destination of ["https://evil.example", "//evil.example", "/\\evil.example", "/login", "/auth/callback", "/%2e%2e//evil.example", "/trip\n"]) {
    assert.equal(redirects.safeAuthDestination(destination), "/");
  }
  assert.equal(redirects.safeAuthDestination("/trips/one?tab=bookings"), "/trips/one?tab=bookings");
});

function middleware(user, refresh = false) {
  let clients = 0;
  const loaded = load("../src/middleware.ts", {
    "@/lib/authRedirect": redirects,
    "@supabase/ssr": { createServerClient: (_url, _key, options) => {
      clients++;
      return { auth: { getUser: async () => {
        if (refresh) options.cookies.setAll([{ name: "session", value: "refreshed", options: { httpOnly: true, path: "/" } }]);
        return { data: { user } };
      } } };
    } },
  });
  return { run: loaded.middleware, clients: () => clients };
}

await test("callbacks and legacy root links remain reachable before authentication", async () => {
  const auth = middleware(null);
  const response = await auth.run(new NextRequest("https://offlog.example/auth/callback?code=first"));
  assert.equal(response.headers.get("location"), null);
  for (const path of ["/", "/login"]) {
    const legacy = await auth.run(new NextRequest(`https://offlog.example${path}?code=first`));
    const location = new URL(legacy.headers.get("location"));
    assert.equal(location.pathname, "/auth/callback");
    assert.equal(location.searchParams.get("code"), "first");
  }
  assert.equal(auth.clients(), 0);
});

await test("login redirects preserve refreshed session cookies and the requested page", async () => {
  const signedIn = middleware({ id: "owner" }, true);
  const response = await signedIn.run(new NextRequest("https://offlog.example/login?next=%2Ftrips%2Fone"));
  assert.equal(response.headers.get("location"), "https://offlog.example/trips/one");
  assert.equal(response.cookies.get("session").value, "refreshed");
  const signedOut = middleware(null, true);
  const login = await signedOut.run(new NextRequest("https://offlog.example/trips/one?tab=bookings"));
  assert.equal(new URL(login.headers.get("location")).searchParams.get("next"), "/trips/one?tab=bookings");
  assert.equal(login.cookies.get("session").value, "refreshed");
});
