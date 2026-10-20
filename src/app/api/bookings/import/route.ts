import { getCurrentUser } from "@/lib/auth";
import { getDocuments, getTrip } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { parseBookingText } from "@/lib/bookingParser";
import { PDFParse } from "pdf-parse";

export const runtime = "nodejs";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_TEXT = 100_000;

export async function GET(request: Request) {
  if (!(await getCurrentUser())) return Response.json({ error: "Please sign in." }, { status: 401 });
  const tripId = new URL(request.url).searchParams.get("tripId") ?? "";
  if (!(await getTrip(tripId))) return Response.json({ error: "Trip not found." }, { status: 404 });
  const documents = await getDocuments(tripId);
  return Response.json({ documents: documents.filter(d => d.mime === "application/pdf" || d.mime === "text/plain").map(d => ({ id: d.id, label: d.label })) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await getCurrentUser())) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (Number(request.headers.get("content-length")) > MAX_BYTES + 100_000) return Response.json({ error: "Use a file smaller than 10 MB." }, { status: 413 });
  try {
    const form = await request.formData();
    const tripId = String(form.get("tripId") ?? "");
    const trip = await getTrip(tripId);
    if (!trip) return Response.json({ error: "Trip not found." }, { status: 404 });
    let text = String(form.get("text") ?? "");
    let file = form.get("file");
    const documentId = String(form.get("documentId") ?? "");
    if (documentId) {
      const document = (await getDocuments(tripId)).find(d => d.id === documentId);
      if (!document) return Response.json({ error: "Document not found." }, { status: 404 });
      if (document.size > MAX_BYTES) throw new Error("Use a file smaller than 10 MB.");
      const supabase = await createClient();
      const { data, error } = await supabase.storage.from("trip-documents").download(document.storage_path);
      if (error || !data) throw new Error("Could not read this document. Please upload it again.");
      file = new File([data], document.filename, { type: document.mime });
    }
    if (file instanceof File && file.size) {
      if (file.size > MAX_BYTES) throw new Error("Use a file smaller than 10 MB.");
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        const parser = new PDFParse({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
        try {
          const result = await parser.getText({ first: 20 });
          text = result.text.replace(/--\s*\d+ of \d+\s*--/g, "").trim();
        } catch {
          throw new Error("Could not read this PDF. Try an unlocked, text-based PDF or paste its text.");
        } finally { await parser.destroy(); }
      } else if (file.type === "text/plain" || /\.txt$/i.test(file.name)) text = await file.text();
      else throw new Error("Choose a text-based PDF or a .txt file. For images or scans, paste the booking text.");
    }
    if (!text.trim()) throw new Error("No readable text found. For scanned PDFs, paste the booking text instead.");
    if (text.length > MAX_TEXT) throw new Error("This document is too long. Paste just the booking details (up to 100,000 characters).");
    return Response.json(parseBookingText(text, trip.currency, { startDate: trip.start_date, endDate: trip.end_date }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not read this booking." }, { status: 400 });
  }
}
