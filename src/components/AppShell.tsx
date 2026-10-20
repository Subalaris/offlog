
"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { Trip } from "@/lib/types";
import { signOutAction } from "@/app/actions";
import { Avatar, AvatarContext } from "./Avatar";

export function AppShell({ children, nextTrip, userEmail, userName, avatarUrl }: { children: React.ReactNode; nextTrip: Trip | null; userEmail: string | null; userName: string; avatarUrl: string | null }) {
  const pathname = usePathname() || "/";
  const menuRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    menuRef.current?.close();
  }, [pathname]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 651px)");
    const closeOnDesktop = () => {
      if (desktop.matches) menuRef.current?.close();
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  if (pathname === "/login") return <main className="auth-main">{children}</main>;
  if (/^\/trips\/[^/]+\/export$/.test(pathname)) return <main className="export-main">{children}</main>;

  const isTrip = pathname !== "/trips/new" && /^\/trips\/[^/]+$/.test(pathname);
  const days = nextTrip
    ? Math.max(0, Math.round((new Date(nextTrip.start_date + "T00:00:00").getTime() - Date.now()) / 86400000))
    : 0;
  const when = !nextTrip ? "" : days === 0 ? "starts today" : days === 1 ? "starts tomorrow" : `in ${days} days`;
  const initials = (userName || userEmail?.split("@")[0] || "U").slice(0, 2).toUpperCase();

  const sidebarContent = (
    <>
        <div className="logo">
          <div className="logo-mark">✈</div>
          <span>OffLog</span>
        </div>

        <div className="nav-label">Travel</div>
        <nav aria-label="Travel">
          <a href="/" aria-label="Dashboard" title="Dashboard" className={pathname === "/" ? "active" : ""}>
            <span className="nav-icon" aria-hidden="true">⌂</span>
            <span className="nav-text">Dashboard</span>
          </a>
          <a href="/trips" aria-label="Trips" title="Trips" className={pathname.startsWith("/trips") ? "active" : ""}>
            <span className="nav-icon" aria-hidden="true">✈</span>
            <span className="nav-text">Trips</span>
          </a>
          <a href="/history" aria-label="History" title="History" className={pathname.startsWith("/history") ? "active" : ""}>
            <span className="nav-icon" aria-hidden="true">◎</span>
            <span className="nav-text">History</span>
          </a>
          <Link href="/profile" aria-label="Your profile" title="Profile" className={pathname === "/profile" ? "active" : ""}>
            <span className="nav-icon" aria-hidden="true">♙</span>
            <span className="nav-text">Profile</span>
          </Link>
        </nav>

        {isTrip && (
          <>
            <div className="nav-label" style={{ marginTop: 26 }}>
              In this trip
            </div>
            <nav aria-label="In this trip">
              <a href="#itinerary" aria-label="Itinerary" title="Itinerary">
                <span className="nav-icon" aria-hidden="true">≡</span>
                <span className="nav-text">Itinerary</span>
              </a>
              <a href="#spending" aria-label="Spending" title="Spending">
                <span className="nav-icon" aria-hidden="true">$</span>
                <span className="nav-text">Spending</span>
              </a>
              <a href="#documents" aria-label="Documents" title="Documents">
                <span className="nav-icon" aria-hidden="true">♢</span>
                <span className="nav-text">Documents</span>
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
            <Link href="/profile" className="account-profile" aria-label="Your profile" title={userName || userEmail || "Your profile"}><Avatar src={avatarUrl} initials={initials} /></Link>
            <button type="submit" className="account-signout">Sign out</button>
          </form>
        </div>
    </>
  );

  return (
    <AvatarContext.Provider value={{ src: avatarUrl, initials }}>
    <div className="app">
      <header className="mobile-header">
        <Link href="/" className="mobile-brand">OffLog</Link>
        <button type="button" className="btn btn-ghost" aria-haspopup="dialog" aria-controls="mobile-navigation"
          onClick={() => menuRef.current?.showModal()}>
          <span aria-hidden="true">☰</span> Menu
        </button>
      </header>
      <aside className="sidebar">{sidebarContent}</aside>
      <dialog ref={menuRef} id="mobile-navigation" className="mobile-menu" aria-label="Navigation"
        onClick={(event) => {
          if (event.target === event.currentTarget || (event.target instanceof Element && event.target.closest("a"))) {
            menuRef.current?.close();
          }
        }}>
        <aside className="sidebar">
          <button type="button" className="mobile-menu-close icon-btn" aria-label="Close menu" autoFocus
            onClick={() => menuRef.current?.close()}>×</button>
          {sidebarContent}
        </aside>
      </dialog>
      <main>{children}</main>
    </div>
    </AvatarContext.Provider>
  );
}
