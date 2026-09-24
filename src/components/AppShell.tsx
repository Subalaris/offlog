
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Trip } from "@/lib/types";
import { signOutAction } from "@/app/actions";

export function AppShell({ children, nextTrip, userEmail }: { children: React.ReactNode; nextTrip: Trip | null; userEmail: string | null }) {
  const pathname = usePathname() || "/";
  if (pathname === "/login") return <main className="auth-main">{children}</main>;

  const isTrip = pathname !== "/trips/new" && /^\/trips\/[^/]+$/.test(pathname);
  const days = nextTrip
    ? Math.max(0, Math.round((new Date(nextTrip.start_date + "T00:00:00").getTime() - Date.now()) / 86400000))
    : 0;
  const when = !nextTrip ? "" : days === 0 ? "starts today" : days === 1 ? "starts tomorrow" : `in ${days} days`;
  const initials = (userEmail?.split("@")[0] || "U").slice(0, 2).toUpperCase();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-mark">✈</div>
          <span>OffLog</span>
        </div>

        <div className="nav-label">Travel</div>
        <nav>
          <a href="/" className={pathname === "/" ? "active" : ""}>
            <span>⌂</span>
            Dashboard
          </a>
          <a href="/trips" className={pathname.startsWith("/trips") ? "active" : ""}>
            <span>✈</span>
            Trips
          </a>
        </nav>

        {isTrip && (
          <>
            <div className="nav-label" style={{ marginTop: 26 }}>
              In this trip
            </div>
            <nav>
              <a href="#itinerary">
                <span>≡</span>
                Itinerary
              </a>
              <a href="#spending">
                <span>$</span>
                Spending
              </a>
              <a href="#documents">
                <span>♢</span>
                Documents
              </a>
            </nav>
          </>
        )}

        <div className="sidebar-bottom">
          {nextTrip && (
            <a className="mini-trip" href={`/trips/${nextTrip.id}`}>
              <small>Next adventure</small>
              <strong>{nextTrip.destination || nextTrip.name}</strong>
              <small>{when}</small>
            </a>
          )}
          <form action={signOutAction} className="account-row">
            <div className="avatar" title={userEmail ?? "Signed in"}>{initials}</div>
            <button type="submit" className="account-signout">Sign out</button>
          </form>
        </div>
      </aside>

      <main>{children}</main>
    </div>
  );
}
