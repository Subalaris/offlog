"use client";

import { useEffect, useRef, useState } from "react";
import type { BookingDraft } from "@/lib/bookingParser";

export function BookingImport({ tripId, disabled, onBusyChange, onImport }: { tripId: string; disabled: boolean; onBusyChange: (busy: boolean) => void; onImport: (draft: BookingDraft) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [documents, setDocuments] = useState<{ id: string; label: string }[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch(`/api/bookings/import?tripId=${encodeURIComponent(tripId)}`, { signal: controller.signal })
      .then(response => response.json()).then(data => setDocuments(data.documents ?? [])).catch(() => {});
    return () => controller.abort();
  }, [open, tripId]);

  return <div className="booking-import">
    <button type="button" className="btn btn-ghost btn-sm" disabled={disabled || busy} aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? "Hide import" : "Fill from document or text"}
    </button>
    {open && <div className="booking-import-fields">
      <p>Import a confirmation, then review the filled fields before saving. Recognized details replace matching fields.</p>
      <label className="field">Paste booking text
        <textarea rows={4} maxLength={100000} value={text} disabled={disabled || busy} onChange={event => { setText(event.target.value); setFile(null); setDocumentId(""); if (fileInput.current) fileInput.current.value = ""; }} placeholder={"Airline: TAP Air Portugal\nConfirmation code: ABC123\nFrom: Lisbon (LIS)\nTo: Porto (OPO)\nDeparture: 2026-11-10 14:30"} />
      </label>
      <label className="field">Or choose a PDF or text file (up to 10 MB)
        <input ref={fileInput} type="file" accept=".pdf,.txt,application/pdf,text/plain" disabled={disabled || busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setDocumentId(""); setText(""); }} />
      </label>
      {documents.length > 0 && <label className="field">Or use an uploaded document
        <select value={documentId} disabled={disabled || busy} onChange={event => { setDocumentId(event.target.value); setFile(null); setText(""); if (fileInput.current) fileInput.current.value = ""; }}>
          <option value="">Choose a document…</option>
          {documents.map(document => <option key={document.id} value={document.id}>{document.label}</option>)}
        </select>
      </label>}
      <p>Supports KLM schedules, Airbnb confirmations, labeled booking text, and text-based PDFs (first 20 pages). For images or scanned PDFs, paste the text.</p>
      <button type="button" className="btn btn-primary btn-sm" disabled={disabled || busy || (!text.trim() && !file && !documentId)} onClick={async () => {
        setError(""); setMessage("");
        if (file && file.size > 10 * 1024 * 1024) { setError("Use a file smaller than 10 MB."); return; }
        setBusy(true); onBusyChange(true);
        try {
          const form = new FormData();
          form.set("tripId", tripId);
          if (documentId) form.set("documentId", documentId);
          else if (file) form.set("file", file);
          else form.set("text", text);
          const response = await fetch("/api/bookings/import", { method: "POST", body: form });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Could not import this booking.");
          onImport(data.draft);
          setMessage(`Booking fields filled. ${data.warnings.join(" ")}`);
        } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not import this booking."); }
        finally { setBusy(false); onBusyChange(false); }
      }}>{busy ? "Reading…" : "Fill booking"}</button>
    </div>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    {message && <p className="booking-import-result" role="status">{message}</p>}
  </div>;
}
