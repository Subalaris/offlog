
import Link from "next/link";
import { getTrips } from "@/lib/db";
import { fmtRange, nightsBetween, todayStr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TripsPage() {
  const trips = await getTrips();
  const today = todayStr();
  const upcoming = trips
    .filter((t) => t.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const past = trips
    .filter((t) => t.end_date < today)
    .sort((a, b) => b.end_date.localeCompare(a.end_date));

  const Group = ({ label, items, dim }: { label: string; items: typeof trips; dim?: boolean }) =>
    items.length === 0 ? null : (
      <>
        <div className="section-title">{label}</div>
        <section className="cards">
          {items.map((t) => (
            <Link href={`/trips/${t.id}`} key={t.id} className="trip-link">
              <article className="card" style={dim ? { opacity: .7 } : undefined}>
                <div className="card-header">
                  <div className="card-label">{t.destination || "Trip"}</div>
                  <div className="card-icon">✈</div>
                </div>
                <div className="tc-name">{t.name}</div>
                <div className="tc-meta">
                  {fmtRange(t.start_date, t.end_date)} · {nightsBetween(t.start_date, t.end_date)} nights
                </div>
              </article>
            </Link>
          ))}
        </section>
      </>
    );

  return (
    <>
      <header className="topbar">
        <div className="greeting">
          <h1>Trips</h1>
          <p>Every journey you&rsquo;ve planned, in one place.</p>
        </div>
        <div className="top-actions">
          <Link href="/trips/new" className="btn btn-primary btn-sm">New Trip</Link>
          <Link href="/" className="btn btn-ghost btn-sm">← Dashboard</Link>
          <div className="avatar">ML</div>
        </div>
      </header>

      {trips.length === 0 && (
        <div className="empty" style={{ marginBottom: 26 }}>
          No trips yet — use New Trip to create your first one.
        </div>
      )}

      <Group label="Upcoming" items={upcoming} />
      <Group label="Past" items={past} dim />
    </>
  );
}
