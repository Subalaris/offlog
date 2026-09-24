
export function fmtRange(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const sameYear = s.getFullYear() === e.getFullYear();
  const sDay = s.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const eDay = e.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (!sameYear) return `${sDay} ${s.getFullYear()} \u2013 ${eDay} ${e.getFullYear()}`;
  return `${sDay} \u2013 ${eDay}`;
}

export function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function fmtMD(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { month: "short", day: "2-digit" }).toUpperCase();
}

export function nightsBetween(start: string, end: string): number {
  const a = new Date(start + "T00:00:00").getTime();
  const b = new Date(end + "T00:00:00").getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function fmtMoney(v: number | null, currency = ""): string {
  if (v == null) return "";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "USD",
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: v % 1 ? 2 : 0,
    }).format(v);
  } catch {
    return `${v} ${currency}`.trim();
  }
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function airportCode(place: string): string {
  const m = place.trim().match(/\(([A-Za-z]{2,4})\)/);
  if (m) return m[1].toUpperCase();
  const w = place.trim().split(/\s+/)[0] || "";
  return (w || "?").slice(0, 3).toUpperCase();
}

export function cityName(place: string): string {
  const c = place.replace(/\s*\([A-Za-z]{2,4}\)/, "").trim();
  return c || place;
}
