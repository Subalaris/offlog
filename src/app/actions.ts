
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Booking, BookingType, Trip } from "@/lib/types";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  insertBooking, updateBooking, deleteBooking,
  insertTrip, updateTrip as updateTripRecord, deleteTrip,
  insertDocument, deleteDocument, getTrip, uid,
} from "@/lib/db";

function revalidateTrip(tripId: string) {
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/");
}

// ---------- trips ----------
export async function createTrip(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") || "").trim();
  const start = String(formData.get("start_date") || "");
  const end = String(formData.get("end_date") || "");
  if (!name || !start || !end) return;
  const budget = Number(formData.get("budget")) || null;
  const trip: Trip = {
    id: uid("trip"),
    owner_id: user.id,
    name,
    destination: String(formData.get("destination") || "").trim(),
    start_date: start,
    end_date: end,
    budget,
    currency: "USD",
    notes: String(formData.get("notes") || "").trim(),
    created_at: new Date().toISOString(),
  };
  await insertTrip(trip);
  revalidateTrip(trip.id);
  redirect(`/trips/${trip.id}`);
}

export async function updateTrip(tripId: string, formData: FormData) {
  await requireUser();
  await updateTripRecord(tripId, {
    name: String(formData.get("name") || "").trim(),
    destination: String(formData.get("destination") || "").trim(),
    start_date: String(formData.get("start_date") || ""),
    end_date: String(formData.get("end_date") || ""),
    budget: Number(formData.get("budget")) || null,
    notes: String(formData.get("notes") || "").trim(),
  });
  revalidateTrip(tripId);
}

export async function deleteTripAction(tripId: string) {
  await requireUser();
  await deleteTrip(tripId);
  revalidatePath("/");
  redirect("/");
}

// ---------- bookings ----------
export async function createBooking(tripId: string, formData: FormData) {
  await requireUser();
  if (!(await getTrip(tripId))) throw new Error("Trip not found");
  const type = (String(formData.get("type") || "flight") as BookingType);
  const booking: Booking = {
    id: uid("bk"),
    trip_id: tripId,
    type,
    title: String(formData.get("title") || "").trim(),
    date: String(formData.get("date") || ""),
    time: String(formData.get("time") || ""),
    ends_at: String(formData.get("ends_at") || "") || null,
    provider: String(formData.get("provider") || "").trim(),
    reference: String(formData.get("reference") || "").trim(),
    seat: String(formData.get("seat") || "").trim(),
    from_place: String(formData.get("from_place") || "").trim(),
    to_place: String(formData.get("to_place") || "").trim(),
    cost: formData.get("cost") ? Number(formData.get("cost")) : null,
    currency: "USD",
    status: (String(formData.get("status") || "booked") as Booking["status"]),
    notes: String(formData.get("notes") || "").trim(),
  };
  await insertBooking(booking);
  revalidateTrip(tripId);
}

export async function updateBookingAction(bookingId: string, formData: FormData) {
  await requireUser();
  const tripId = String(formData.get("trip_id") || "");
  const patch: Partial<Booking> = {
    type: String(formData.get("type") || "flight") as BookingType,
    title: String(formData.get("title") || "").trim(),
    date: String(formData.get("date") || ""),
    time: String(formData.get("time") || ""),
    ends_at: String(formData.get("ends_at") || "") || null,
    provider: String(formData.get("provider") || "").trim(),
    reference: String(formData.get("reference") || "").trim(),
    seat: String(formData.get("seat") || "").trim(),
    from_place: String(formData.get("from_place") || "").trim(),
    to_place: String(formData.get("to_place") || "").trim(),
    cost: formData.get("cost") ? Number(formData.get("cost")) : null,
    status: (String(formData.get("status") || "booked") as Booking["status"]),
    notes: String(formData.get("notes") || "").trim(),
  };
  await updateBooking(bookingId, patch);
  if (tripId) revalidateTrip(tripId);
}

export async function deleteBookingAction(tripId: string, bookingId: string) {
  await requireUser();
  await deleteBooking(tripId, bookingId);
  revalidateTrip(tripId);
}

// ---------- documents ----------
export async function uploadDocument(tripId: string, formData: FormData) {
  const user = await requireUser();
  if (!(await getTrip(tripId))) throw new Error("Trip not found");
  const label = String(formData.get("label") || "").trim();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return;

  const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
  if (!allowedTypes.has(file.type)) throw new Error("Only PDF, JPG, PNG, and WebP files are allowed");
  if (file.size > 10 * 1024 * 1024) throw new Error("Files must be 10 MB or smaller");

  const id = uid("doc");
  const filename = `${Date.now()}_${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const storagePath = `${user.id}/${tripId}/${id}/${filename}`;
  const doc = {
    id,
    trip_id: tripId,
    label: label || file.name,
    filename,
    storage_path: storagePath,
    size: file.size,
    kind: file.type.includes("pdf") ? "pdf" : file.type.startsWith("image/") ? "image" : "file",
    mime: file.type || "application/octet-stream",
    created_at: new Date().toISOString(),
  };

  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage
    .from("trip-documents")
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  try {
    await insertDocument(doc);
  } catch (error) {
    await supabase.storage.from("trip-documents").remove([storagePath]);
    throw error;
  }
  revalidateTrip(tripId);
}

export async function deleteDocumentAction(tripId: string, docId: string) {
  await requireUser();
  await deleteDocument(tripId, docId);
  revalidateTrip(tripId);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
