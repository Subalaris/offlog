import "server-only";

import crypto from "node:crypto";
import type { Booking, DocumentItem, Place, Trip, Visit, VisitSource } from "./types";
import { createClient } from "./supabase/server";

export function uid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(5).toString("hex")}`;
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function getTrips(): Promise<Trip[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("trips").select("*").order("start_date");
  fail(error);
  return (data ?? []) as Trip[];
}

export async function getTrip(id: string): Promise<Trip | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("trips").select("*").eq("id", id).maybeSingle();
  fail(error);
  return data as Trip | null;
}

export async function insertTrip(trip: Trip) {
  const supabase = await createClient();
  const { error } = await supabase.from("trips").insert(trip);
  fail(error);
}

export async function updateTrip(id: string, patch: Partial<Trip>) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("trips").update(patch).eq("id", id).select().maybeSingle();
  fail(error);
  return data as Trip | null;
}

export async function deleteTrip(id: string) {
  const supabase = await createClient();
  const { data: docs, error: docsError } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("trip_id", id);
  fail(docsError);

  const paths = (docs ?? []).map((document) => document.storage_path);
  if (paths.length) {
    const { error } = await supabase.storage.from("trip-documents").remove(paths);
    fail(error);
  }

  const { error } = await supabase.from("trips").delete().eq("id", id);
  fail(error);
}

export async function getBookings(tripId: string): Promise<Booking[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("trip_id", tripId)
    .order("date")
    .order("time");
  fail(error);
  return (data ?? []) as Booking[];
}

export async function insertBooking(booking: Booking) {
  const supabase = await createClient();
  const { error } = await supabase.from("bookings").insert(booking);
  fail(error);
}

export async function updateBooking(id: string, patch: Partial<Booking>) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("bookings").update(patch).eq("id", id).select().maybeSingle();
  fail(error);
  return data as Booking | null;
}

export async function deleteBooking(tripId: string, id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("bookings").delete().eq("id", id).eq("trip_id", tripId);
  fail(error);
}

export async function getDocuments(tripId: string): Promise<DocumentItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });
  fail(error);
  return (data ?? []) as DocumentItem[];
}

export async function getDocument(tripId: string, filename: string): Promise<DocumentItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("trip_id", tripId)
    .eq("filename", filename)
    .maybeSingle();
  fail(error);
  return data as DocumentItem | null;
}

export async function insertDocument(document: DocumentItem) {
  const supabase = await createClient();
  const { error } = await supabase.from("documents").insert(document);
  fail(error);
}

export async function deleteDocument(tripId: string, id: string) {
  const supabase = await createClient();
  const { data: document, error: findError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .eq("trip_id", tripId)
    .maybeSingle();
  fail(findError);
  if (!document) return;

  const { error: storageError } = await supabase.storage
    .from("trip-documents")
    .remove([document.storage_path]);
  fail(storageError);

  const { error } = await supabase.from("documents").delete().eq("id", id).eq("trip_id", tripId);
  fail(error);
}

function placeKey(city: string, country: string) {
  return `${city.trim().toLowerCase()}|${country.trim().toLowerCase()}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

export interface VisitInput {
  city: string;
  country: string;
  countryCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  startDate: string;
  endDate: string;
  source?: VisitSource;
  externalId?: string | null;
  tripId?: string | null;
}

async function getOrCreatePlace(ownerId: string, input: VisitInput): Promise<Place> {
  const supabase = await createClient();
  const normalizedKey = placeKey(input.city, input.country);
  const { data: existing, error: findError } = await supabase
    .from("places")
    .select("*")
    .eq("normalized_key", normalizedKey)
    .maybeSingle();
  fail(findError);
  if (existing) {
    const needsCoordinates =
      (existing.latitude == null && input.latitude != null) ||
      (existing.longitude == null && input.longitude != null);
    if (!needsCoordinates) return existing as Place;
    const { data: updated, error: updateError } = await supabase
      .from("places")
      .update({
        latitude: existing.latitude ?? input.latitude ?? null,
        longitude: existing.longitude ?? input.longitude ?? null,
      })
      .eq("id", existing.id)
      .select()
      .single();
    fail(updateError);
    return updated as Place;
  }

  const place: Place = {
    id: uid("place"),
    owner_id: ownerId,
    city: input.city.trim(),
    country: input.country.trim(),
    country_code: input.countryCode?.trim().toUpperCase() || null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    normalized_key: normalizedKey,
    created_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("places").insert(place).select().single();
  if (error?.code === "23505") {
    const { data: raced, error: racedError } = await supabase
      .from("places")
      .select("*")
      .eq("normalized_key", normalizedKey)
      .single();
    fail(racedError);
    return raced as Place;
  }
  fail(error);
  return data as Place;
}

export async function getVisits(): Promise<Visit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("visits")
    .select("*, place:places(*)")
    .order("start_date", { ascending: false });
  fail(error);
  return (data ?? []) as Visit[];
}

export async function insertVisit(ownerId: string, input: VisitInput) {
  const supabase = await createClient();
  const place = await getOrCreatePlace(ownerId, input);
  const visit = {
    id: uid("visit"),
    owner_id: ownerId,
    place_id: place.id,
    trip_id: input.tripId || null,
    start_date: input.startDate,
    end_date: input.endDate,
    source: input.source ?? "manual",
    external_id: input.externalId || null,
    created_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("visits").insert(visit);
  if (error?.code !== "23505") fail(error);
}

export async function deleteDuplicateVisitRecords(ownerId: string, ids: string[]) {
  if (!ids.length) return 0;
  const supabase = await createClient();
  const { data, error } = await supabase.from("visits")
    .delete().eq("owner_id", ownerId).in("id", ids).select("id");
  fail(error);
  return data?.length ?? 0;
}

export async function updateVisitRecord(ownerId: string, id: string, input: VisitInput) {
  const supabase = await createClient();
  const { data: current, error: currentError } = await supabase
    .from("visits")
    .select("place_id")
    .eq("id", id)
    .maybeSingle();
  fail(currentError);
  if (!current) return;
  const place = await getOrCreatePlace(ownerId, input);
  const { error } = await supabase
    .from("visits")
    .update({
      place_id: place.id,
      start_date: input.startDate,
      end_date: input.endDate,
    })
    .eq("id", id);
  fail(error);
  if (current.place_id !== place.id) await deletePlaceIfUnused(current.place_id);
}

async function deletePlaceIfUnused(placeId: string) {
  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("visits")
    .select("id", { count: "exact", head: true })
    .eq("place_id", placeId);
  fail(countError);
  if (count === 0) {
    const { error: placeError } = await supabase.from("places").delete().eq("id", placeId);
    fail(placeError);
  }
}

export async function deleteVisitRecord(id: string) {
  const supabase = await createClient();
  const { data: visit, error: findError } = await supabase
    .from("visits")
    .select("place_id")
    .eq("id", id)
    .maybeSingle();
  fail(findError);
  if (!visit) return;
  const { error } = await supabase.from("visits").delete().eq("id", id);
  fail(error);
  await deletePlaceIfUnused(visit.place_id);
}
