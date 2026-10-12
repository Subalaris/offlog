import type { Metadata } from "next";
import Link from "next/link";
import { NewTripCard } from "@/components/NewTripCard";
import { UserAvatar } from "@/components/Avatar";

export const metadata: Metadata = {
  title: "New Trip",
};

export default function NewTripPage() {
  return (
    <>
      <header className="topbar">
        <div className="greeting">
          <h1>New Trip</h1>
          <p>Start with the essentials. You can add bookings and documents next.</p>
        </div>
        <div className="top-actions">
          <Link href="/" className="btn btn-ghost btn-sm">
            ← Dashboard
          </Link>
          <UserAvatar />
        </div>
      </header>

      <div style={{ maxWidth: 760 }}>
        <NewTripCard />
      </div>
    </>
  );
}
