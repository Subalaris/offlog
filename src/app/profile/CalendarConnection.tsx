"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CalendarSubscriptionState } from "@/lib/calendarSubscription";
import { enableCalendarSubscription, disableCalendarSubscription } from "./calendarActions";

export function CalendarConnection({ initialState }: { initialState: CalendarSubscriptionState }) {
  const router = useRouter();
  const [token, setToken] = useState(initialState.token);
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ text: initialState.error ?? "", error: Boolean(initialState.error) });
  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => {
    setToken(initialState.token);
    if (initialState.error) setStatus({ text: initialState.error, error: true });
    else setStatus(current => current.error ? { text: "", error: false } : current);
  }, [initialState.token, initialState.error]);
  const url = token && origin ? `${origin}/api/calendar/${token}` : "";
  const localOnly = origin && !origin.startsWith("https://");

  async function changeConnection(disconnect: boolean) {
    setBusy(true); setStatus({ text: "", error: false });
    try {
      if (disconnect) {
        const result = await disableCalendarSubscription();
        if (result.error) throw new Error(result.error);
        setToken(null);
        setStatus({ text: "Calendar link disconnected. Remove the old subscription in Google Calendar too.", error: false });
      } else {
        const result = await enableCalendarSubscription();
        if (result.error || !result.token) throw new Error(result.error || "Could not create your calendar link.");
        const replacing = Boolean(token);
        setToken(result.token);
        setStatus({ text: replacing ? "Link replaced. Subscribe using the new link; the old link no longer works." : "Your link is ready. Add it in Google Calendar using the steps below.", error: false });
      }
    } catch (caught) { setStatus({ text: caught instanceof Error ? caught.message : "Could not update your calendar connection. Please try again.", error: true }); }
    finally { setBusy(false); }
  }

  return <section className="card calendar-connection" aria-labelledby="calendar-connection-title" aria-busy={busy}>
    <h2 className="profile-heading" id="calendar-connection-title">Google Calendar</h2>
    <p className="profile-help">See your OffLog bookings in Google Calendar using a private subscription. Changes in OffLog appear when Google refreshes the calendar; updates may take a while.</p>
    <p className="profile-help">Bookings appear as all-day itinerary markers, with local times in the details. Bookings without dates are omitted.</p>
    {!initialState.available && <p className="auth-message" role="status">Calendar subscriptions aren’t available yet. Please check back later.</p>}
    {initialState.available && !initialState.error && !token && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => changeConnection(false)}>
      {busy ? "Creating link…" : "Create calendar link"}
    </button>}
    {token && <div className="calendar-subscription-details">
      <p className="profile-help">Keep this link private: anyone with it can read your trip names, dates, providers, and locations. Confirmation codes, costs, notes, and documents are excluded.</p>
      <label className="field">Private subscription URL
        <input type="url" readOnly value={url} onFocus={event => event.currentTarget.select()} autoComplete="off" spellCheck={false} />
      </label>
      <div className="calendar-connection-actions">
        <button type="button" className="btn btn-primary" disabled={busy || !url} onClick={async () => {
          try { await navigator.clipboard.writeText(url); setStatus({ text: "Calendar link copied.", error: false }); }
          catch { setStatus({ text: "Could not copy automatically. Select and copy the subscription URL above.", error: true }); }
        }}>Copy calendar link</button>
        <a className="btn btn-ghost" href="https://calendar.google.com/calendar/" target="_blank" rel="noreferrer">Open Google Calendar</a>
      </div>
      <ol className="calendar-connection-steps">
        <li>Open Google Calendar on a computer.</li>
        <li>Next to <strong>Other calendars</strong>, select <strong>+</strong>, then <strong>From URL</strong>.</li>
        <li>Paste your subscription URL and select <strong>Add calendar</strong>.</li>
      </ol>
      {localOnly && <p className="profile-help">Google needs a publicly reachable HTTPS link. Create your subscription from the deployed OffLog app.</p>}
      <div className="calendar-connection-actions">
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => {
          if (confirm("Replace your calendar link? The old link will stop working, and you’ll need to add the new link in Google Calendar.")) void changeConnection(false);
        }}>Replace link</button>
        <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => {
          if (confirm("Disconnect this calendar link? Google will stop receiving updates. Previously downloaded entries may remain until you remove the subscription in Google Calendar.")) void changeConnection(true);
        }}>{busy ? "Updating…" : "Disconnect"}</button>
      </div>
    </div>}
    {initialState.error && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => router.refresh()}>Reload connection</button>}
    {status.text && <p role={status.error ? "alert" : "status"} className={`auth-message ${status.error ? "auth-error" : ""}`}>{status.text}</p>}
  </section>;
}
