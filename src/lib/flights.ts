import type { Booking, FlightLeg } from "./types";

export function emptyFlightLeg(): FlightLeg {
  return {
    from_place: "", to_place: "", departure_date: "", departure_time: "",
    arrival_date: "", arrival_time: "", flight_number: "", seat: "",
  };
}

export function bookingFlightLegs(booking?: Booking): FlightLeg[] {
  if (booking?.flight_legs?.length) return booking.flight_legs;
  return [{
    ...emptyFlightLeg(),
    from_place: booking?.from_place ?? "",
    to_place: booking?.to_place ?? "",
    departure_date: booking?.date ?? "",
    departure_time: booking?.time?.slice(0, 5) ?? "",
    seat: booking?.seat ?? "",
  }];
}

// Insert a connection before the final destination, preserving the journey's final arrival.
export function addFlightConnection(legs: FlightLeg[]): FlightLeg[] {
  const last = legs.at(-1)!;
  return [
    ...legs.slice(0, -1),
    { ...last, to_place: "", arrival_date: "", arrival_time: "" },
    {
      ...emptyFlightLeg(), to_place: last.to_place,
      departure_date: last.arrival_date || last.departure_date,
      arrival_date: last.arrival_date, arrival_time: last.arrival_time,
    },
  ];
}

export function updateFlightLeg(legs: FlightLeg[], index: number, patch: Partial<FlightLeg>): FlightLeg[] {
  return legs.map((leg, legIndex) => {
    if (legIndex === index) return { ...leg, ...patch };
    if (legIndex === index + 1 && "to_place" in patch) return { ...leg, from_place: patch.to_place! };
    if (legIndex === index - 1 && "from_place" in patch) return { ...leg, to_place: patch.from_place! };
    return leg;
  });
}

export function removeFlightLeg(legs: FlightLeg[], index: number): FlightLeg[] {
  if (legs.length <= 1 || index <= 0 || index >= legs.length) return legs;
  const remaining = legs.filter((_, legIndex) => legIndex !== index);
  remaining[index - 1] = {
    ...remaining[index - 1], to_place: legs[index].to_place,
    arrival_date: legs[index].arrival_date, arrival_time: legs[index].arrival_time,
  };
  return remaining;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseFlightLegs(raw: FormDataEntryValue | null): FlightLeg[] {
  if (!raw) return []; // Older clients can still save bookings without leg data.
  let value: unknown;
  try { value = JSON.parse(String(raw)); } catch { throw new Error("Could not read the flight details."); }
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) throw new Error("A flight booking must have between 1 and 10 legs.");
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid flight details.");
    const leg = emptyFlightLeg();
    for (const key of Object.keys(leg) as Array<keyof FlightLeg>) {
      if (typeof item[key] !== "string") throw new Error(`Flight ${index + 1}: invalid ${key.replaceAll("_", " ")}.`);
      leg[key] = item[key].trim();
      if (leg[key].length > 200) throw new Error(`Flight ${index + 1}: details are too long.`);
    }
    for (const key of ["departure_date", "arrival_date"] as const) {
      if (leg[key] && !validDate(leg[key])) throw new Error(`Flight ${index + 1}: enter a valid date.`);
    }
    for (const key of ["departure_time", "arrival_time"] as const) {
      if (leg[key] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(leg[key])) throw new Error(`Flight ${index + 1}: enter a valid time.`);
    }
    if (value.length > 1 && (!leg.from_place || !leg.to_place)) throw new Error(`Flight ${index + 1}: enter both airports.`);
    return leg;
  }).map((leg, index, legs) => {
    if (index > 0 && leg.from_place.toLowerCase() !== legs[index - 1].to_place.toLowerCase()) {
      throw new Error(`Flight ${index + 1} must depart from the previous flight's arrival airport.`);
    }
    return leg;
  });
}

export function flightBookingSummary(legs: FlightLeg[]) {
  const first = legs[0];
  const last = legs.at(-1)!;
  return {
    from_place: first.from_place, to_place: last.to_place,
    date: first.departure_date, time: first.departure_time, seat: first.seat,
  };
}
