import "server-only";

import crypto from "node:crypto";
import type { Booking, DocumentItem, Trip } from "./types";
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
