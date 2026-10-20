import type { Booking } from "./types";

export const DEFAULT_CHECK_IN = "15:00";
export const DEFAULT_CHECK_OUT = "11:00";

export function stayTimes(booking?: Pick<Booking, "time" | "checkout_time">) {
  return {
    checkIn: booking?.time?.slice(0, 5) || DEFAULT_CHECK_IN,
    checkOut: booking?.checkout_time?.slice(0, 5) || DEFAULT_CHECK_OUT,
  };
}

export function parseStayBooking(form: FormData) {
  const date = String(form.get("date") || "");
  const ends_at = String(form.get("ends_at") || "");
  const time = String(form.get("time") || DEFAULT_CHECK_IN);
  const checkout_time = String(form.get("checkout_time") || DEFAULT_CHECK_OUT);
  for (const value of [date, ends_at]) {
    if (!value) continue;
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new Error("Enter a valid check-in and check-out date.");
    }
  }
  for (const value of [time, checkout_time]) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("Enter a valid check-in and check-out time.");
  }
  if (date && ends_at && (ends_at < date || (ends_at === date && checkout_time <= time))) {
    throw new Error("Check-out must be after check-in. Check the dates and times.");
  }
  return { time, checkout_time, ends_at: ends_at || null };
}
