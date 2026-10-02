
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Booking, BookingType, Trip, VisitSource } from "@/lib/types";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  insertBooking, updateBooking, deleteBooking,
  insertTrip, updateTrip as updateTripRecord, deleteTrip,
  insertDocument, deleteDocument, getTrip, uid,
  insertVisit, updateVisitRecord, deleteVisitRecord, getVisits, deleteDuplicateVisitRecords,
} from "@/lib/db";
import type { VisitInput } from "@/lib/db";
import { validateDuplicateRemoval, type DuplicateVisitSelection } from "@/lib/visitDuplicates";

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

// ---------- travel history ----------
function optionalNumber(value: FormDataEntryValue | null) {
  if (value == null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validateVisitInput(input: VisitInput): VisitInput {
  const city = input.city.trim();
  const country = input.country.trim();
  if (!city || !country) throw new Error("City and country are required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
    throw new Error("Valid arrival and departure dates are required");
  }
  if (input.endDate < input.startDate) throw new Error("Departure cannot be before arrival");
  if (input.latitude != null && (input.latitude < -90 || input.latitude > 90)) {
    throw new Error("Latitude must be between -90 and 90");
  }
  if (input.longitude != null && (input.longitude < -180 || input.longitude > 180)) {
    throw new Error("Longitude must be between -180 and 180");
  }
  return {
    ...input,
    city: city.slice(0, 160),
    country: country.slice(0, 160),
    countryCode: input.countryCode?.trim().slice(0, 2).toUpperCase() || null,
    externalId: input.externalId?.slice(0, 500) || null,
  };
}

function visitFromForm(formData: FormData): VisitInput {
  return validateVisitInput({
    city: String(formData.get("city") || ""),
    country: String(formData.get("country") || ""),
    countryCode: String(formData.get("country_code") || "") || null,
    latitude: optionalNumber(formData.get("latitude")),
    longitude: optionalNumber(formData.get("longitude")),
    startDate: String(formData.get("start_date") || ""),
    endDate: String(formData.get("end_date") || ""),
    source: (String(formData.get("source") || "manual") as VisitSource),
    tripId: String(formData.get("trip_id") || "") || null,
  });
}

export async function createVisitAction(formData: FormData) {
  const user = await requireUser();
  const input = visitFromForm(formData);
  if (input.tripId && !(await getTrip(input.tripId))) throw new Error("Trip not found");
  await insertVisit(user.id, input);
  revalidatePath("/history");
}

export async function updateVisitAction(visitId: string, formData: FormData) {
  const user = await requireUser();
  await updateVisitRecord(user.id, visitId, visitFromForm(formData));
  revalidatePath("/history");
}

export async function deleteVisitAction(visitId: string) {
  await requireUser();
  await deleteVisitRecord(visitId);
  revalidatePath("/history");
}

export async function removeDuplicateVisitsAction(selections: DuplicateVisitSelection[]) {
  const user = await requireUser();
  if (!Array.isArray(selections) || selections.length > 500 || selections.some((selection) =>
    !selection || typeof selection.keepId !== "string" || !Array.isArray(selection.removeIds)
    || selection.removeIds.some((id) => typeof id !== "string")
  )) throw new Error("Invalid duplicate selection");
  const ids = validateDuplicateRemoval(await getVisits(), selections);
  if (ids.length > 500) throw new Error("Remove at most 500 duplicates at a time. Select fewer groups.");
  const removed = await deleteDuplicateVisitRecords(user.id, ids);
  revalidatePath("/history");
  return removed;
}

export interface ImportedVisitInput {
  city: string;
  country: string;
  startDate: string;
  endDate: string;
  latitude?: number | null;
  longitude?: number | null;
  externalId: string;
}

export async function importGoogleTimelineAction(rows: ImportedVisitInput[]) {
  const user = await requireUser();
  if (!Array.isArray(rows) || rows.length === 0) return;
  if (rows.length > 500) throw new Error("Import at most 500 reviewed visits at a time");
  for (const row of rows) {
    await insertVisit(user.id, validateVisitInput({
      ...row,
      source: "google_timeline",
    }));
  }
  revalidatePath("/history");
}

export async function importGooglePhotosAction(rows: ImportedVisitInput[]) {
  const user = await requireUser();
  if (!Array.isArray(rows) || rows.length === 0) return;
  if (rows.length > 500) throw new Error("Import at most 500 reviewed visits at a time");
  for (const row of rows) {
    await insertVisit(user.id, validateVisitInput({
      ...row,
      source: "google_photos",
    }));
  }
  revalidatePath("/history");
}

export interface ReverseGeocodeInput {
  id: string;
  latitude: number;
  longitude: number;
}

export interface ReverseGeocodeResult {
  id: string;
  city: string;
  country: string;
  countryCode: string;
}

export async function reverseGeocodeAction(points: ReverseGeocodeInput[]): Promise<ReverseGeocodeResult[]> {
  await requireUser();
  const apiKey = process.env.BIGDATACLOUD_API_KEY;
  if (!apiKey) throw new Error("BigDataCloud is not configured yet");
  if (!Array.isArray(points) || points.length === 0) return [];
  if (points.length > 50) throw new Error("Resolve at most 50 location groups at a time");

  const validPoints = points.map((point) => {
    if (
      !point.id ||
      !Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90 ||
      !Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180
    ) throw new Error("Invalid coordinates in Timeline import");
    return point;
  });

  const results: ReverseGeocodeResult[] = [];
  for (let index = 0; index < validPoints.length; index += 5) {
    const batch = validPoints.slice(index, index + 5);
    const resolved = await Promise.all(batch.map(async (point) => {
      const url = new URL("https://api-bdc.net/data/reverse-geocode");
      url.searchParams.set("latitude", String(point.latitude));
      url.searchParams.set("longitude", String(point.longitude));
      url.searchParams.set("localityLanguage", "en");
      const response = await fetch(url, {
        headers: { "x-bdc-key": apiKey },
        cache: "no-store",
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("BigDataCloud rejected the API key or Reverse Geocoding is not enabled");
        }
        if (response.status === 402) {
          throw new Error("BigDataCloud's monthly request allowance has been reached");
        }
        throw new Error(`BigDataCloud lookup failed (${response.status})`);
      }
      const data = await response.json() as {
        city?: string;
        locality?: string;
        principalSubdivision?: string;
        countryName?: string;
        countryCode?: string;
      };
      return {
        id: point.id,
        city: String(data.city || data.locality || data.principalSubdivision || "").trim(),
        country: String(data.countryName || "").trim(),
        countryCode: String(data.countryCode || "").trim().toUpperCase(),
      };
    }));
    results.push(...resolved);
  }
  return results;
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
