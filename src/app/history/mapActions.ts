"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { findCityCandidates, type CityRecord } from "@/lib/cityLookup";
import { validMapCoordinates } from "@/lib/visitedMap";

export async function lookupPlaceLocation(placeId: string) {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: place, error } = await supabase.from("places")
    .select("city,country,country_code").eq("id", placeId).eq("owner_id", user.id).single();
  if (error || !place) throw new Error("This place is unavailable. Refresh your history and try again.");
  // Server-only bundled data: no network geocoding requests, keys, or API quotas.
  const cities = require("all-the-cities") as CityRecord[];
  return findCityCandidates(cities, place.city, place.country, place.country_code);
}

export async function savePlaceLocation(placeId: string, latitude: number, longitude: number) {
  const user = await requireUser();
  if (!validMapCoordinates(latitude, longitude)) throw new Error("Choose valid latitude and longitude coordinates.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("places").update({ latitude, longitude })
    .eq("id", placeId).eq("owner_id", user.id).select("id").single();
  if (error || !data) throw new Error("Could not save this location. Please try again.");
  revalidatePath("/history");
}
