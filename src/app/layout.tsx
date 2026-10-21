
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { getTrips } from "@/lib/db";
import { todayStr } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { readProfile } from "@/lib/profile";
import { profilePhotoPath, profilePhotoUrl } from "@/lib/profilePhoto";

export const metadata: Metadata = {
  title: { default: "OffLog", template: "%s · OffLog" },
  description: "A quiet place to keep your trips: flights, stays, plans, papers and money.",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg", shortcut: "/icon.svg" },
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
        <AppShell signedIn={Boolean(user)} nextTrip={next} userEmail={user?.email ?? null} userName={readProfile(user?.user_metadata).display_name}
          avatarUrl={user ? profilePhotoUrl(profilePhotoPath(user.user_metadata, user.id)) : null}>{children}</AppShell>
      </body>
    </html>
  );
}
