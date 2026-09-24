
import Link from "next/link";
import { getTrips, getBookings } from "@/lib/db";
import {
  fmtRange, fmtDate, nightsBetween, fmtMoney, greeting, todayStr,
  airportCode, cityName,
} from "@/lib/format";
import { TYPE_META, type Trip, type Booking } from "@/lib/types";

export const dynamic = "force-dynamic";

function heroFlight(bookings: Booking[]) {
  return (
    bookings
      .filter((b) => b.type === "flight" && b.from_place && b.to_place)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0] ?? null
  );
}

export default async function Home() {
  const trips = await getTrips();
  const today = todayStr();
  const upcoming = trips
    .filter((t) => t.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const past = trips
    .filter((t) => t.end_date < today)
    .sort((a, b) => b.end_date.localeCompare(a.end_date));

  const heroTrip = upcoming[0] ?? null;
  const hero = heroTrip ? (await getBookings(heroTrip.id)) : [];
  const flight = heroFlight(hero);
  const stays = hero
    .filter((b) => b.type === "stay")
    .sort((a, b) => a.date.localeCompare(b.date));
  const other = hero
    .filter((b) => b.type !== "flight" && b.type !== "stay")
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const spend = hero.reduce((s, b) => s + (b.cost || 0), 0);
  const spent = (t: Trip) => {
    const bs = hero.filter((b) => b.trip_id === t.id);
    return bs.reduce((s, b) => s + (b.cost || 0), 0);
  };

  return (
    <>
      <header className="topbar">
        <div className="greeting">
          <h1>{greeting()}</h1>
          <p>
            {upcoming.length > 0
              ? "Ready for your next adventure?"
              : "Your trips, your tickets, your keys — one ledger."}
          </p>
        </div>
        <div className="top-actions">
          <Link href="/trips/new" className="btn btn-primary btn-sm">
            New Trip
          </Link>
          <Link href="/trips" className="btn btn-ghost btn-sm">
            All trips →
          </Link>
          <div className="avatar">ML</div>
        </div>
      </header>

      {/* HERO */}
      {heroTrip ? (
        <section className="hero">
          <div className="hero-label">Next adventure</div>
          <h2>{heroTrip.name}</h2>
          {heroTrip.destination && (
            <p className="hero-sub">
              {heroTrip.destination} · {fmtRange(heroTrip.start_date, heroTrip.end_date)}
            </p>
          )}

          {flight ? (
            <div className="route">
              <div className="airport">
                <div className="airport-code">{airportCode(flight.from_place)}</div>
                <div className="airport-city">{cityName(flight.from_place)}</div>
              </div>
              <div className="route-line">
                <div className="line" />
                <div className="plane">✈</div>
                <div className="line" />
              </div>
              <div className="airport">
                <div className="airport-code">{airportCode(flight.to_place)}</div>
                <div className="airport-city">{cityName(flight.to_place)}</div>
              </div>
            </div>
          ) : stays[0] ? (
            <div className="route">
              <div className="airport">
                <div className="airport-code">⌂</div>
                <div className="airport-city">{stays[0].provider || "Staying somewhere"}</div>
              </div>
              <div className="route-line">
                <div className="line" />
              </div>
              <div className="airport">
                <div className="airport-code">{nightsBetween(stays[0].date, stays[0].ends_at || stays[0].date)}n</div>
                <div className="airport-city">nights</div>
              </div>
            </div>
          ) : (
            <div className="route">
              <div className="airport">
                <div className="airport-code">{heroTrip.destination ? heroTrip.destination.split(",")[0].slice(0, 3).toUpperCase() : "???"}</div>
                <div className="airport-city">{heroTrip.destination || "No destination set"}</div>
              </div>
              <div className="route-line">
                <div className="line" />
              </div>
              <div className="airport">
                <div className="airport-city">{nightsBetween(heroTrip.start_date, heroTrip.end_date)} nights</div>
              </div>
            </div>
          )}

          <div className="hero-stats">
            <div className="hero-stat">
              <strong>{fmtRange(heroTrip.start_date, heroTrip.end_date)}</strong>
              <br />
              Dates
            </div>
            <div className="hero-stat">
              <strong>{nightsBetween(heroTrip.start_date, heroTrip.end_date)} nights</strong>
              <br />
              Trip length
            </div>
            {heroTrip.budget != null && (
              <div className="hero-stat">
                <strong>{fmtMoney(spend, heroTrip.currency)} / {fmtMoney(heroTrip.budget, heroTrip.currency)}</strong>
                <br />
                Spent / budget
              </div>
            )}
          </div>

          <Link href={`/trips/${heroTrip.id}`} className="hero-button">
            View trip →
          </Link>
        </section>
      ) : (
        <section className="hero">
          <div className="hero-label">OffLog</div>
          <h2>Where are we going next?</h2>
          <p className="hero-sub">
            No upcoming trips yet. Add flights, stays and plans to a trip and they
            will light up here.
          </p>
          <Link href="/trips/new" className="hero-button">
            Start a trip →
          </Link>
        </section>
      )}

      {/* COMING UP */}
      {heroTrip && (
        <>
          <div className="section-title">Coming up</div>
          <section className="cards">
            {flight && (
              <article className="card">
                <div className="card-header">
                  <div className="card-label">Flight</div>
                  <div className="card-icon">✈</div>
                </div>
                <div className="flight-route">
                  <div>
                    <div className="flight-code">{airportCode(flight.from_place)}</div>
                    <div className="flight-city">{cityName(flight.from_place)}</div>
                  </div>
                  <div className="flight-arrow">→</div>
                  <div>
                    <div className="flight-code">{airportCode(flight.to_place)}</div>
                    <div className="flight-city">{cityName(flight.to_place)}</div>
                  </div>
                </div>
                <div className="card-footer">
                  <span>
                    {fmtDate(flight.date)}
                    {flight.time ? ` · ${flight.time}` : ""}
                  </span>
                  <span>{flight.provider || "—"}</span>
                </div>
              </article>
            )}

            {stays[0] && (
              <article className="card">
                <div className="card-header">
                  <div className="card-label">Accommodation</div>
                  <div className="card-icon">⌂</div>
                </div>
                <div className="card-title">{stays[0].title || stays[0].provider}</div>
                <div className="card-sub">
                  {stays[0].provider && stays[0].title ? stays[0].provider : heroTrip.destination}
                </div>
                <div className="card-footer">
                  <span>
                    {fmtRange(stays[0].date, stays[0].ends_at || stays[0].date)}
                  </span>
                  <span className={stays[0].status === "booked" ? "st-ok" : "st-pending"}>
                    ● {stays[0].status === "booked" ? "Confirmed" : "Pending"}
                  </span>
                </div>
              </article>
            )}

            {other[0] && (
              <article className="card">
                <div className="card-header">
                  <div className="card-label">{TYPE_META[other[0].type].label}</div>
                  <div className="card-icon">♢</div>
                </div>
                <div className="card-title">{other[0].title}</div>
                <div className="card-sub">{other[0].provider || other[0].from_place}</div>
                <div className="card-footer">
                  <span>
                    {fmtDate(other[0].date)}
                    {other[0].time ? ` · ${other[0].time}` : ""}
                  </span>
                  {other[0].cost != null && <span>{fmtMoney(other[0].cost, other[0].currency)}</span>}
                </div>
              </article>
            )}

            {!flight && !stays[0] && !other[0] && (
              <div className="empty" style={{ gridColumn: "1 / -1" }}>
                Nothing booked for this trip yet — open it to add flights and stays.
              </div>
            )}
          </section>
        </>
      )}

      {/* TRIPS */}
      {trips.length > 0 && (
        <>
          <div className="section-title">Your trips</div>
          <section className="cards">
            {trips
              .sort((a, b) => a.start_date.localeCompare(b.start_date))
              .slice(0, 6)
              .map((t) => (
                <Link href={`/trips/${t.id}`} key={t.id} className="trip-link">
                  <article className="card">
                    <div className="card-header">
                      <div className="card-label">
                        {t.end_date >= today ? "Upcoming" : "Past"}
                      </div>
                      <div className="card-icon">✈</div>
                    </div>
                    <div className="tc-name">{t.name}</div>
                    <div className="tc-meta">
                      {fmtRange(t.start_date, t.end_date)}
                      {t.destination ? ` · ${t.destination}` : ""}
                    </div>
                    <div className="card-footer">
                      <span>{nightsBetween(t.start_date, t.end_date)} nights</span>
                      <span>{t.destination || "—"}</span>
                    </div>
                  </article>
                </Link>
              ))}
          </section>
        </>
      )}

    </>
  );
}
