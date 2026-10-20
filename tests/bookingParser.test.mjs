import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const compiled = ts.transpileModule(readFileSync(new URL("../src/lib/bookingParser.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function("exports", "module", compiled)(module.exports, module);
const { parseBookingText, importDate, importTime } = module.exports;

test("flight confirmation imports both legs with separate local dates", () => {
  const { draft } = parseBookingText(`Airline: Lufthansa
Booking reference: ABC123
Total: EUR 1,234.56
Flight 1:
From: Miami (MIA)
To: Munich (MUC)
Departure: 2026-11-10 18:30
Arrival: 2026-11-11 09:30
Flight number: LH 461
Seat: 14C
Flight 2:
From: Munich (MUC)
To: Zagreb (ZAG)
Departure: 2026-11-11 11:00
Arrival: 2026-11-11 12:10
Flight number: LH 1726`, "EUR");
  assert.equal(draft.reference, "ABC123");
  assert.equal(draft.cost, 1234.56);
  assert.equal(draft.flight_legs.length, 2);
  assert.equal(draft.flight_legs[0].departure_date, "2026-11-10");
  assert.equal(draft.flight_legs[0].arrival_date, "2026-11-11");
  assert.equal(draft.flight_legs[0].flight_number, "LH461");
  assert.equal(draft.flight_legs[1].to_place, "Zagreb (ZAG)");
});
test("stay confirmation imports dates, times and code", () => {
  const { draft } = parseBookingText("Hotel: H10 Hotels\nHotel name: Villa Alva\nCheck-in: 10 November 2026 3:30 pm\nCheck-out: November 14, 2026 11 am\nConfirmation number:\nSTAY123\nTotal: EUR 400", "EUR");
  assert.equal(draft.type, "stay");
  assert.equal(draft.title, "Villa Alva");
  assert.equal(draft.date, "2026-11-10");
  assert.equal(draft.time, "15:30");
  assert.equal(draft.ends_at, "2026-11-14");
  assert.equal(draft.checkout_time, "11:00");
  assert.equal(draft.reference, "STAY123");
});
test("ambiguous dates, invalid times and currency mismatches aren't silently guessed", () => {
  assert.equal(importDate("11/12/2026"), undefined);
  assert.equal(importDate("2026-02-30"), undefined);
  assert.equal(importTime("24:30"), undefined);
  assert.equal(importTime("13:00 pm"), undefined);
  assert.equal(importTime("12 am"), "00:00");
  const result = parseBookingText("Type: activity\nTitle: Museum tour\nTotal: USD 200", "EUR");
  assert.equal(result.draft.cost, undefined);
  assert.match(result.warnings.join(" "), /USD/);
  assert.equal(parseBookingText("Title: Tour\nTotal: 1.234,56 EUR", "EUR").draft.cost, undefined);
  assert.throws(() => parseBookingText("Unstructured words without booking fields", "EUR"), /No booking fields/);
});
test("transfer and activity fields work without creating flight legs", () => {
  const { draft } = parseBookingText("Type: transfer\nProvider: Airport shuttle\nFrom: LIS\nTo: Hotel\nDate: 2026-11-11\nTime: 10:45\nCost: 0", "EUR");
  assert.equal(draft.type, "transfer");
  assert.equal(draft.from_place, "LIS");
  assert.equal(draft.time, "10:45");
  assert.equal(draft.cost, 0);
  assert.equal(draft.flight_legs, undefined);
});

test("real PDF text extraction feeds the booking parser", async () => {
  const { PDFParse } = await import("pdf-parse");
  const content = "BT /F1 12 Tf 40 760 Td (Airline: Example Air) Tj 0 -20 Td (Confirmation code: PDF123) Tj 0 -20 Td (Departure: 2026-11-10 14:30) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const parser = new PDFParse({ data: new Uint8Array(Buffer.from(pdf)), isEvalSupported: false });
  try {
    const extracted = await parser.getText({ first: 20 });
    const { draft } = parseBookingText(extracted.text, "EUR");
    assert.equal(draft.reference, "PDF123");
    assert.equal(draft.flight_legs[0].departure_date, "2026-11-10");
  } finally { await parser.destroy(); }
});

test("import endpoint requires auth and trip access before reading stored documents", async () => {
  const source = readFileSync(new URL("../src/app/api/bookings/import/route.ts", import.meta.url), "utf8");
  const compiledRoute = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let user = null, trip = null, documents = [], downloads = 0;
  const routeModule = { exports: {} };
  const require = name => {
    if (name === "@/lib/auth") return { getCurrentUser: async () => user };
    if (name === "@/lib/db") return { getTrip: async () => trip, getDocuments: async () => documents };
    if (name === "@/lib/bookingParser") return { parseBookingText };
    if (name === "@/lib/supabase/server") return { createClient: async () => { downloads++; throw new Error("unexpected storage access"); } };
    return {};
  };
  new Function("require", "exports", "module", compiledRoute)(require, routeModule.exports, routeModule);
  const { POST, GET } = routeModule.exports;
  const request = (documentId = "", text = "") => {
    const body = new FormData(); body.set("tripId", "trip"); body.set("documentId", documentId); body.set("text", text);
    return new Request("http://localhost/api/bookings/import", { method: "POST", body });
  };
  assert.equal((await POST(request())).status, 401);
  user = { id: "user" };
  assert.equal((await POST(request())).status, 404);
  trip = { id: "trip", currency: "EUR" };
  assert.equal((await POST(request("other-trip-doc"))).status, 404);
  assert.equal(downloads, 0);
  const response = await POST(request("", "Title: Museum tour\nType: activity\nTotal: EUR 20"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).draft.cost, 20);
  const hostedText = readFileSync(new URL("./fixtures/hosted-stay-email.txt", import.meta.url), "utf8");
  const hostedResponse = await POST(request("", hostedText));
  assert.equal(hostedResponse.status, 200);
  const hostedDraft = (await hostedResponse.json()).draft;
  assert.equal(hostedDraft.title, "CASA EXAMPLE in the historic center.");
  assert.equal(hostedDraft.time, "16:00");
  assert.equal(hostedDraft.checkout_time, "11:00");
  assert.equal(hostedDraft.notes, "Address: 123 Example Street, Rome, Italy");
  documents = [{ id: "pdf", label: "Flight", mime: "application/pdf", storage_path: "private-path" }, { id: "scan", label: "Scan", mime: "image/png" }];
  const listed = await GET(new Request("http://localhost/api/bookings/import?tripId=trip"));
  assert.deepEqual((await listed.json()).documents, [{ id: "pdf", label: "Flight" }]);
});

test("KLM email layout imports flights despite check-in baggage and mail headers", () => {
  const text = readFileSync(new URL("./fixtures/klm-email.txt", import.meta.url), "utf8");
  const { draft } = parseBookingText(text, "USD");
  assert.equal(draft.type, "flight");
  assert.equal(draft.title, "Milan → Toronto");
  assert.equal(draft.provider, "KLM Royal Dutch Airlines");
  assert.equal(draft.reference, "DEMO12");
  assert.equal(draft.cost, 475.3);
  assert.equal(draft.date, "2027-01-05");
  assert.equal(draft.time, "13:00");
  assert.deepEqual(draft.flight_legs.map(leg => [leg.flight_number, leg.departure_time, leg.arrival_time]), [
    ["KL1598", "13:00", "14:50"], ["KL0695", "16:50", "19:15"],
  ]);
  assert.equal(draft.flight_legs[0].to_place, draft.flight_legs[1].from_place);
  assert.equal(draft.to_place, "Toronto, Pearson International Airport, YYZ");
  assert.equal(draft.flight_legs[0].seat, "");
  const mismatch = parseBookingText(text, "EUR");
  assert.equal(mismatch.draft.cost, undefined);
  assert.match(mismatch.warnings.join(" "), /USD/);
});

test("Airbnb copied email supports separate date and time lines", () => {
  const text = `Airbnb
Your reservation is confirmed
You're going to Paris!
Entire rental unit in Paris
Check-in
Fri, Nov 13, 2026
After 3:00 PM
Checkout
Mon, Nov 16, 2026
Before 11:00 AM
Confirmation code
HMDEMO1234
Total (EUR)
€450.00`;
  const { draft } = parseBookingText(text, "EUR");
  assert.equal(draft.type, "stay");
  assert.equal(draft.provider, "Airbnb");
  assert.equal(draft.title, "Entire rental unit in Paris");
  assert.equal(draft.date, "2026-11-13");
  assert.equal(draft.ends_at, "2026-11-16");
  assert.equal(draft.time, "15:00");
  assert.equal(draft.checkout_time, "11:00");
  assert.equal(draft.reference, "HMDEMO1234");
  assert.equal(draft.cost, 450);
});

test("Airbnb two-column dates use trip context only for an unambiguous missing year", () => {
  for (const table of [
    "Check-in\tCheckout\nFri, Nov 13\tMon, Nov 16\n3:00 PM\t11:00 AM",
    "Check-in\nCheckout\nFri, Nov 13\nMon, Nov 16\n3:00 PM\n11:00 AM",
  ]) {
    const text = `Airbnb\nYour reservation is confirmed\n${table}\nConfirmation code\nHMDEMO1234`;
    const { draft, warnings } = parseBookingText(text, "EUR", { startDate: "2026-11-10", endDate: "2026-11-20" });
    assert.equal(draft.date, "2026-11-13");
    assert.equal(draft.ends_at, "2026-11-16");
    assert.equal(draft.time, "15:00");
    assert.equal(draft.checkout_time, "11:00");
    assert.match(warnings.join(" "), /confirm the year/);
    const noContext = parseBookingText(text, "EUR");
    assert.equal(noContext.draft.date, undefined);
    assert.equal(noContext.draft.ends_at, undefined);
    const ambiguous = parseBookingText(text, "EUR", { startDate: "2026-01-01", endDate: "2027-12-31" });
    assert.equal(ambiguous.draft.date, undefined);
    assert.equal(ambiguous.draft.ends_at, undefined);
  }
});

test("Airbnb overnight stay can cross New Year without using email send date", () => {
  const text = "Airbnb\nSent: 20 October 2026\nCheck-in\nDec 30\n3 PM\nCheck-out\nJan 2\n11 AM\nConfirmation code: HMDEMO1234";
  const { draft } = parseBookingText(text, "USD", { startDate: "2026-12-28", endDate: "2027-01-05" });
  assert.equal(draft.date, "2026-12-30");
  assert.equal(draft.ends_at, "2027-01-02");
});

test("partially recognized Airbnb table keeps check-in and checkout in their columns", () => {
  const text = "Airbnb\nCheck-in\tCheckout\nNov 13\tNov 16, 2026\n3 PM\t11 AM\nConfirmation code: HMDEMO1234\nTotal (EUR) €450.00";
  const { draft } = parseBookingText(text, "EUR");
  assert.equal(draft.date, undefined);
  assert.equal(draft.ends_at, "2026-11-16");
  assert.equal(draft.cost, 450);
  assert.throws(() => parseBookingText("Airbnb\nThanks for your reservation!", "EUR"), /No booking fields/);
});

test("hosted stay excerpt fills unlabelled property name without an Airbnb header", () => {
  const text = readFileSync(new URL("./fixtures/hosted-stay-email.txt", import.meta.url), "utf8");
  const { draft } = parseBookingText(text, "EUR");
  assert.deepEqual(draft, {
    type: "stay", title: "CASA EXAMPLE in the historic center.", provider: "Alex",
    date: "2026-12-28", time: "16:00", ends_at: "2027-01-02", checkout_time: "11:00",
    notes: "Address: 123 Example Street, Rome, Italy",
  });
  assert.equal(parseBookingText(`Airbnb\n${text}`, "EUR").draft.provider, "Airbnb");
  const noTitle = text.replace("CASA EXAMPLE in the historic center.\n", "");
  assert.equal(parseBookingText(noTitle, "EUR").draft.title, "Entire home/apt");
});
