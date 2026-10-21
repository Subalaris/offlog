import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import Dashboard from "@/components/Dashboard";
import { LandingPage } from "@/components/LandingPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "OffLog — Your trip, in one place." },
  description: "Keep your bookings, travel documents, itinerary, and budget together—from your first reservation to your flight home.",
  openGraph: {
    title: "OffLog — Your trip, in one place.",
    description: "A private space for your travel plans. Organize bookings, keep documents close, and remember where you’ve been.",
    type: "website",
  },
};

export default async function Home() {
  const user = await getCurrentUser();
  return user ? <Dashboard /> : <LandingPage />;
}
