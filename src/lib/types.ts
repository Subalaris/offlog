
export const BOOKING_TYPES = [
  "flight",
  "stay",
  "transfer",
  "activity",
] as const;
export type BookingType = (typeof BOOKING_TYPES)[number];

export interface Trip {
  id: string;
  owner_id: string;
  name: string;
  destination: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  budget: number | null;
  currency: string;
  notes: string;
  created_at: string;
}

export interface Booking {
  id: string;
  trip_id: string;
  type: BookingType;
  title: string;
  date: string; // YYYY-MM-DD (booking day or check-in)
  time: string; // HH:mm optional
  ends_at: string | null; // for stays: check-out date
  provider: string; // airline / hotel / operator
  reference: string; // confirmation code
  seat: string;
  from_place: string;
  to_place: string;
  cost: number | null;
  currency: string;
  status: "booked" | "pending" | "done";
  notes: string;
}

export interface DocumentItem {
  id: string;
  trip_id: string;
  label: string;
  filename: string;
  storage_path: string;
  size: number;
  kind: string;
  mime: string;
  created_at: string;
}

export interface DB {
  trips: Trip[];
  bookings: Booking[];
  documents: DocumentItem[];
}

export const TYPE_META: Record<BookingType, { label: string; glyph: string; color: string }> = {
  flight:   { label: "Flight",   glyph: "\u2708", color: "#22d3ee" },
  stay:     { label: "Stay",     glyph: "\u2302", color: "#0891b2" },
  transfer: { label: "Transfer", glyph: "\u21C4", color: "#34d399" },
  activity: { label: "Activity", glyph: "\u25C8", color: "#fbbf24" },
};
