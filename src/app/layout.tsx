
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { getTrips } from "@/lib/db";
import { todayStr } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: { default: "OffLog", template: "%s · OffLog" },
  description: "A quiet place to keep your trips: flights, stays, plans, papers and money.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#07141c",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  const trips = user ? await getTrips() : [];
  const today = todayStr();
  const next =
    trips
      .filter((t) => t.start_date >= today)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null;

  return (
    <html lang="en">
      <body>
        <AppShell nextTrip={next} userEmail={user?.email ?? null}>{children}</AppShell>
      </body>
    </html>
  );
}
