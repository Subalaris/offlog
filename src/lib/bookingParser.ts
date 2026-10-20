import type { Booking, BookingType, FlightLeg } from "./types";

export type BookingDraft = Partial<Pick<Booking, "type" | "title" | "date" | "time" | "ends_at" | "checkout_time" | "provider" | "reference" | "from_place" | "to_place" | "cost" | "flight_legs" | "notes">>;

// Only accept explicit dates: locale-dependent numeric dates are left for review.
export function importDate(value: string): string | undefined {
  value = value.replace(/(\d)(?:st|nd|rd|th)\b/gi, "$1").replace(/\b([A-Za-z]{3})\./g, "$1");
  const iso = value.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const named = value.match(/\b(\d{1,2})\s+([A-Za-z]+)\s*,?\s*(20\d{2})\b/) ?? value.match(/\b([A-Za-z]+)\s+(\d{1,2}),?\s+(20\d{2})\b/);
  let result = iso?.[0];
  if (!result && named) {
    const dayFirst = /^\d/.test(named[1]);
    const month = months.indexOf(named[dayFirst ? 2 : 1].slice(0, 3).toLowerCase());
    if (month >= 0) result = `${named[3]}-${String(month + 1).padStart(2, "0")}-${named[dayFirst ? 1 : 2].padStart(2, "0")}`;
  }
  return result && !Number.isNaN(Date.parse(result)) && new Date(result).toISOString().slice(0, 10) === result ? result : undefined;
}

export function importTime(value: string): string | undefined {
  const match = value.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i) ?? value.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (!match) return;
  let hour = Number(match[1]);
  const minute = match.length === 4 ? Number(match[2]) : 0;
  const period = (match.length === 4 ? match[3] : match[2])?.toLowerCase();
  if (minute > 59 || (period ? hour < 1 || hour > 12 : hour > 23)) return;
  if (period) hour = hour % 12 + (period === "pm" ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

interface ImportContext { startDate?: string; endDate?: string }

// Airbnb often omits the year. Resolve it only when one date fits the selected trip.
function stayDate(value: string, context: ImportContext, inferred: Set<string>) {
  const explicit = importDate(value);
  if (explicit || /\b20\d{2}\b/.test(value) || !context.startDate || !context.endDate) return explicit;
  const first = Number(context.startDate.slice(0, 4)), last = Number(context.endDate.slice(0, 4));
  if (!Number.isFinite(first) || last - first > 5) return;
  const candidates: string[] = [];
  for (let year = first; year <= last; year++) {
    const date = importDate(`${value} ${year}`);
    if (date && date >= context.startDate && date <= context.endDate) candidates.push(date);
  }
  if (candidates.length === 1) { inferred.add(candidates[0]); return candidates[0]; }
}

function staySchedule(lines: string[], context: ImportContext, inferred: Set<string>): BookingDraft {
  const checkIn = /^check[ -]?in(?:\b|:)/i, checkOut = /^check[ -]?out(?:\b|:)/i;
  const start = lines.findIndex(line => checkIn.test(line));
  const end = lines.findIndex(line => checkOut.test(line));
  const together = start >= 0 && /check[ -]?out/i.test(lines[start]);
  if (together || (start >= 0 && end === start + 1 && /^check[ -]?in\s*:?$/i.test(lines[start]) && /^check[ -]?out\s*:?$/i.test(lines[end]))) {
    // Two-column tables become either tab-separated rows or successive copied cells.
    const cells = lines.slice(together ? start : end, (together ? start : end) + 7).flatMap(line => line.split(/\t+| {2,}/));
    const months = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
    const datePattern = new RegExp(`\\b(?:20\\d{2}-\\d{2}-\\d{2}|\\d{1,2}\\s+(?:${months})\\.?|(?:${months})\\.?\\s+\\d{1,2})(?:,?\\s+20\\d{2})?\\b`, "gi");
    const dates = cells.flatMap(cell => [...cell.matchAll(datePattern)].map(match => stayDate(match[0], context, inferred)));
    const times = cells.flatMap(cell => [...cell.matchAll(/\b\d{1,2}:\d{2}\s*(?:am|pm)?\b|\b\d{1,2}\s*(?:am|pm)\b/gi)].map(match => importTime(match[0])));
    return { date: dates[0], ends_at: dates[1], time: times[0], checkout_time: times[1] };
  }
  const read = (index: number) => {
    if (index < 0) return {};
    const section = [lines[index]];
    for (const line of lines.slice(index + 1, index + 6)) {
      if (/^(?:check[ -]?(?:in|out)|confirmation|address|price|total|reservation|guests|host|payment)\b/i.test(line)) break;
      section.push(line);
    }
    return { date: section.map(line => stayDate(line, context, inferred)).find(Boolean), time: section.map(importTime).find(Boolean) };
  };
  const arrival = read(start), departure = read(end);
  return { date: arrival.date, time: arrival.time, ends_at: departure.date, checkout_time: departure.time };
}

// Email printouts include mail headers and page furniture that are not booking fields.
function bookingLines(source: string) {
  return source.replace(/\r\n?/g, "\n").replace(/[\u00a0\u202f]/g, " ").replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .split("\n").map(line => line.trim()).filter(line => line
      && !/^(?:from|to|cc|bcc|reply-to):.*@/i.test(line)
      && !/^https?:\/\/mail\.google\.com\//i.test(line)
      && !/^--\s*\d+ of \d+\s*--$/.test(line)
      && !/^.*\bGmail - /.test(line));
}

function scheduleLegs(lines: string[]): FlightLeg[] {
  const headings = lines.flatMap((line, index) => /^Flight to\s+\S/i.test(line) ? [index] : []);
  return headings.flatMap((start, index) => {
    const section = lines.slice(start + 1, headings[index + 1] ?? lines.length);
    const stamps = section.flatMap((line, row) => {
      const date = importDate(line), time = importTime(line);
      return date && time ? [{ date, time, row }] : [];
    });
    if (stamps.length < 2) return [];
    const [departure, arrival] = stamps;
    const airport = (row: number) => {
      // Airport lines must contain a code, so a footer or cabin label cannot become a place.
      const place = section[row + 1] ?? "";
      return /(?:,\s*|\()[A-Z]{3}\)?$/.test(place) ? place : "";
    };
    const from = airport(departure.row), to = airport(arrival.row);
    if (!from || !to) return [];
    const detail = section.slice(departure.row + 2, arrival.row);
    const flight = detail.join("\n").match(/^(?:Flight(?: number)?\s*[:#]?\s*)?([A-Z][A-Z0-9]\s?\d{1,4})\b/m)?.[1] ?? "";
    const seat = detail.join("\n").match(/\bSeat(?: number)?\s*[:#]?\s*(\d{1,3}[A-Z])\b/i)?.[1] ?? "";
    return [{ from_place: from, to_place: to, departure_date: departure.date, departure_time: departure.time,
      arrival_date: arrival.date, arrival_time: arrival.time, flight_number: flight.replace(/\s/g, ""), seat }];
  });
}

export function parseBookingText(source: string, currency: string, context: ImportContext = {}): { draft: BookingDraft; warnings: string[] } {
  const lines = bookingLines(source);
  const text = lines.join("\n");
  const schedule = scheduleLegs(lines);
  const inferredDates = new Set<string>();
  const field = (labels: string, input = lines): string => {
    const pattern = new RegExp(`^(?:${labels})\\s*(?::|#|\\t|\\s[-–]\\s)\\s*(.+)$`, "i");
    for (let i = 0; i < input.length; i++) {
      const match = input[i].match(pattern);
      if (match) return match[1].trim();
      if (new RegExp(`^(?:${labels})\\s*:?$`, "i").test(input[i])) return input[i + 1] ?? "";
    }
    return "";
  };
  const explicitType = field("type|booking type").toLowerCase();
  let type: BookingType | undefined = ["flight", "stay", "transfer", "activity"].includes(explicitType) ? explicitType as BookingType : undefined;
  if (!type) {
    if (/\bAirbnb\b/i.test(text)) type = "stay";
    else if (schedule.length || /\b(flight|airline|e-ticket|boarding)\b/i.test(text)) type = "flight";
    else if (/\b(hotel|accommodation|check[ -]?out)\b/i.test(text)) type = "stay";
    else if (/\b(transfer|taxi|shuttle|car rental)\b/i.test(text)) type = "transfer";
    else if (/\b(activity|tour|excursion|admission)\b/i.test(text)) type = "activity";
    else if (/\b(departure|arrival)\b/i.test(text)) type = "flight";
    else if (/\bcheck[ -]?in\b/i.test(text)) type = "stay";
  }
  const draft: BookingDraft = {};
  if (type) draft.type = type;
  const put = (key: "title" | "provider" | "reference" | "from_place" | "to_place", value: string) => { if (value) draft[key] = value; };
  put("title", field("title|hotel name|property|listing(?: name)?|accommodation name|activity|tour"));
  put("provider", field("provider|airline|hotel|operator|property name|issued by"));
  put("reference", field("confirmation(?: code| number| no\\.?)?|booking (?:reference|number|code|id)|reservation (?:number|code|id)|record locator|PNR").replace(/^#\s*/, ""));
  put("from_place", field("from|origin|departure airport|pickup(?: location)?"));
  put("to_place", field("to|destination|arrival airport|drop[ -]?off(?: location)?"));
  const start = field("check[ -]?in(?: date)?|departure(?: date)?|date|start(?: date)?");
  const end = field("check[ -]?out(?: date)?|end(?: date)?");
  draft.date = importDate(start);
  draft.time = importTime(field("check[ -]?in time|departure time|time|start time") || start);
  if (type === "stay") {
    draft.ends_at = importDate(end);
    draft.checkout_time = importTime(field("check[ -]?out time") || end);
  }
  if (type === "stay") {
    const stay = staySchedule(lines, context, inferredDates);
    for (const key of ["date", "time", "ends_at", "checkout_time"] as const) if (stay[key]) draft[key] = stay[key];
    const accommodation = /^(?:entire (?:home(?:\/apt)?|rental unit|apartment|condo|villa|cottage|cabin)|private room|room in)\b/i;
    const hostedIndex = lines.findIndex(line => accommodation.test(line) && /\s+hosted by\s+\S/i.test(line));
    const hosted = hostedIndex >= 0 ? lines[hostedIndex].match(/^(.*?)\s+hosted by\s+(.+)$/i) : null;
    const isAirbnb = /\bAirbnb\b/i.test(text);
    if (isAirbnb) draft.provider = "Airbnb";
    else if (hosted && !draft.provider) draft.provider = hosted[2];
    if (!draft.title) {
      // Copied listing cards put the unlabelled property name directly above the host line.
      const preceding = hostedIndex > 0 ? lines[hostedIndex - 1] : "";
      const isPropertyName = preceding && preceding.length <= 200
        && !/^(?:Airbnb\b|your (?:reservation|booking|stay)\b|you[’']re going to\b|go to\b|https?:|(?:from|to|subject|sent|date):)/i.test(preceding)
        && !importDate(preceding);
      const listing = lines.find(line => accommodation.test(line));
      const destination = text.match(/(?:you[’']re going to|your (?:reservation|stay) in)\s+([^!\n]+)/i)?.[1];
      if (hosted && isPropertyName) draft.title = preceding;
      else if (listing || (isAirbnb && destination)) draft.title = hosted?.[1] ?? listing ?? `Airbnb in ${destination}`;
    }
    const address = field("address|property address");
    if (address && !/^(?:get directions|guests|show more)\b/i.test(address)) draft.notes = `Address: ${address}`;
  }
  let cost = field("total(?: cost| price| paid| amount| ticket price)?|amount paid|cost|price");
  if (!cost) {
    const total = lines.findIndex(line => /^total(?:\s*\([A-Z]{3}\)\s*.*|\s*:?)$/i.test(line));
    if (total >= 0) {
      const labelled = lines[total].match(/^total\s*\(([A-Z]{3})\)\s*:?\s*(.*)$/i);
      cost = `${labelled?.[1] ?? ""} ${labelled?.[2] || lines[total + 1] || ""}`.trim();
    }
  }
  const moneyCurrency = cost.match(/\b[A-Z]{3}\b/)?.[0] ?? (cost.includes("€") ? "EUR" : cost.includes("£") ? "GBP" : cost.includes("$") ? "USD" : undefined);
  const warnings: string[] = [];
  // Reject ambiguous separators rather than interpreting 1.234,56 as 1.23.
  const amount = cost.replace(/\b[A-Z]{3}\b|[$€£]/g, "").trim();
  if (moneyCurrency && moneyCurrency !== currency) warnings.push(`The document total is in ${moneyCurrency}; enter a cost in ${currency}.`);
  else if (/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(amount)) draft.cost = Number(amount.replaceAll(",", ""));
  if (type === "flight" && !schedule.length) {
    // Each explicitly numbered flight becomes a separate leg.
    const blocks = text.split(/\n(?=flight\s+\d+\s*(?:[:\n]|$))/i);
    const hasNumbered = blocks.some(block => /^flight\s+\d+\s*(?:[:\n]|$)/i.test(block));
    const segments = hasNumbered ? blocks.filter(block => /^flight\s+\d+\s*(?:[:\n]|$)/i.test(block)) : [text];
    const legs: FlightLeg[] = segments.slice(0, 10).map(segment => {
      const rows = segment.split("\n").map(line => line.trim()).filter(Boolean);
      const get = (label: string) => field(label, rows);
      const departure = get("departure(?: date)?|date");
      const arrival = get("arrival(?: date)?");
      return {
        from_place: get("from|origin|departure airport"), to_place: get("to|destination|arrival airport"),
        departure_date: importDate(departure) ?? "", departure_time: importTime(get("departure time") || departure) ?? "",
        arrival_date: importDate(arrival) ?? "", arrival_time: importTime(get("arrival time") || arrival) ?? "",
        flight_number: get("flight(?: number| no\\.?)?").replace(/\s+/g, ""), seat: get("seat(?: number)?"),
      };
    });
    if (legs.some(leg => Object.values(leg).some(Boolean))) draft.flight_legs = legs;
    if (segments.length > 10) warnings.push("Only the first 10 flights were imported.");
  }
  if (type === "flight" && schedule.length) {
    draft.flight_legs = schedule.slice(0, 10);
    draft.from_place = schedule[0].from_place;
    draft.to_place = schedule.at(-1)!.to_place;
    draft.date = schedule[0].departure_date;
    draft.time = schedule[0].departure_time;
    draft.title ||= `${schedule[0].from_place.split(",")[0]} → ${schedule.at(-1)!.to_place.split(",")[0]}`;
    if (schedule.length > 10) warnings.push("Only the first 10 flights were imported.");
  }
  if (type === "flight" && !draft.provider && /\bKLM\b/.test(text)) draft.provider = "KLM";
  for (const key of Object.keys(draft) as (keyof BookingDraft)[]) if (draft[key] === undefined) delete draft[key];
  if (!Object.keys(draft).some(key => key !== "type" && key !== "provider")) throw new Error("No booking fields were recognized. Paste the reservation section with its dates, route or property, and confirmation code.");
  if (inferredDates.size) warnings.push(`Dates without a year were matched to your trip: ${[...inferredDates].join(", ")}. Please confirm the year.`);
  if (type === "stay" && (!draft.date || !draft.ends_at)) warnings.push("Some stay dates could not be read. Enter them before saving; dates without a year must match the selected trip.");
  warnings.push("Review all fields before saving. Unrecognized details and ambiguous numeric dates are left for you to enter.");
  return { draft, warnings };
}
