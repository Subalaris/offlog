
"use client";

import { useRef, useState, useTransition } from "react";
import type { DocumentItem } from "@/lib/types";
import { uploadDocument, deleteDocumentAction } from "@/app/actions";
import { fmtBytes, fmtDate } from "@/lib/format";

const KIND_ICON: Record<string, string> = { pdf: "♨", image: "◫", file: "⬓" };

export function DocumentsSection({ tripId, docs }: { tripId: string; docs: DocumentItem[] }) {
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <section className="card" style={{ marginTop: 15 }} id="documents">
      <div className="card-header">
        <div className="card-label">Documents & confirmations</div>
        <div className="card-icon">♢</div>
      </div>
      <p className="card-sub" style={{ marginTop: -8, marginBottom: 16 }}>
        Booking PDFs, e-tickets, insurance — everything you&rsquo;ll need at the gate.
      </p>

      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          const fd = new FormData(event.currentTarget);
          setError("");
          start(async () => {
            try {
              await uploadDocument(tripId, fd);
              formRef.current?.reset();
              setLabel("");
              setFile(null);
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Could not upload this document. Please try again.");
            }
          });
        }}
        aria-busy={pending}
        className="upload-row"
      >
        <label className="upload-label field" style={{ justifyContent: "flex-end" }}>
          Label
          <input
            name="label"
            value={label}
            disabled={pending}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Return flight, TAP TP 1234"
          />
        </label>
        <label className="upload-file field" style={{ justifyContent: "flex-end" }}>
          File
          <input
            name="file"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            disabled={pending}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={{ padding: "8px 10px" }}
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={pending || !file}>
          {pending ? "Uploading…" : "Upload"}
        </button>
      </form>
      {error && <p className="auth-error document-upload-error" role="alert">{error}</p>}

      {docs.length === 0 ? (
        <div className="empty" style={{ marginTop: 14 }}>
          Nothing uploaded yet.
        </div>
      ) : (
        <div className="docs-grid">
          {docs.map((d) => (
            <div className="doc-row" key={d.id}>
              <div className="doc-icon">{KIND_ICON[d.kind] ?? "⬓"}</div>
              <div className="doc-info">
                <div className="doc-label">{d.label}</div>
                <div className="doc-meta">
                  {fmtDate(d.created_at.slice(0, 10))} · {fmtBytes(d.size)}
                </div>
              </div>
              <a
                href={`/api/doc/${d.trip_id}/${encodeURIComponent(d.filename)}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost btn-sm"
              >
                Open
              </a>
              <button
                className="icon-btn"
                title="Delete"
                onClick={async () => {
                  if (confirm(`Delete "${d.label}"?`)) await deleteDocumentAction(tripId, d.id);
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
