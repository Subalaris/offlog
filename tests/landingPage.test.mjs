import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
const Link = ({ children, ...props }) => React.createElement("a", props, children);
function load(path, dependencies = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function("require", "exports", "module", compiled)(name => dependencies[name] ?? require(name), module.exports, module);
  return module.exports;
}
const { LandingPage } = load("../src/components/LandingPage.tsx", {
  "next/link": Link,
  "./LandingPage.module.css": { __esModule: true, default: new Proxy({}, { get: (_target, key) => key }) },
});

await test("public homepage presents the approved features and routes planning CTAs through sign-in", () => {
  const html = renderToStaticMarkup(React.createElement(LandingPage));
  for (const phrase of ["Your trip,", "in one place.", "Bring your confirmations along", "Keep your documents close", "Keep an eye on your budget", "Google Calendar", "Google Photos", "Example itinerary"]) assert.ok(html.includes(phrase));
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.ok(html.includes('href="/login?next=%2Ftrips%2Fnew"'));
  assert.ok(!html.includes('href="/trips/new"'));
  for (const id of ["homepage-content", "features", "on-the-go", "travel-history"]) assert.ok(html.includes(`id="${id}"`));
  assert.ok(html.includes('aria-label="Main navigation"'));
});

await test("root renders the landing page for visitors and dashboard for signed-in users", async () => {
  let user = null, dashboardRenders = 0;
  const { default: Home } = load("../src/app/page.tsx", {
    "@/lib/auth": { getCurrentUser: async () => user },
    "@/components/LandingPage": { LandingPage },
    "@/components/Dashboard": () => { dashboardRenders++; return React.createElement("p", null, "Private dashboard"); },
  });
  assert.ok(renderToStaticMarkup(await Home()).includes("Your trip,"));
  assert.equal(dashboardRenders, 0);
  user = { id: "owner" };
  assert.equal(renderToStaticMarkup(await Home()), "<p>Private dashboard</p>");
  assert.equal(dashboardRenders, 1);
});

await test("public root has no account sidebar; signed-in root retains app navigation", () => {
  const { AppShell } = load("../src/components/AppShell.tsx", {
    "next/link": Link,
    "next/navigation": { usePathname: () => "/" },
    "@/app/actions": { signOutAction: async () => {} },
    "./Avatar": { Avatar: () => null, AvatarContext: React.createContext({}) },
  });
  const props = { nextTrip: null, userEmail: null, userName: "", avatarUrl: null, children: React.createElement("p", null, "Page") };
  const publicShell = renderToStaticMarkup(React.createElement(AppShell, { ...props, signedIn: false }));
  assert.equal(publicShell, "<p>Page</p>");
  const privateShell = renderToStaticMarkup(React.createElement(AppShell, { ...props, signedIn: true }));
  assert.ok(privateShell.includes('aria-label="Travel"'));
  assert.ok(privateShell.includes('aria-label="Dashboard"'));
});
