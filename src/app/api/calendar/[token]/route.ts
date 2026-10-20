import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { isCalendarToken, renderCalendar, type CalendarFeed } from "@/lib/calendarFeed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isCalendarToken(token)) return new Response("Calendar not found.", { status: 404, headers });
  try {
    // Always use an anonymous client: only the token-gated RPC may read calendar data.
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.rpc("read_offlog_calendar", { p_token: token });
    if (error) throw error;
    if (!data) return new Response("Calendar not found.", { status: 404, headers });
    const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL || request.url).origin;
    const body = renderCalendar(data as CalendarFeed, origin);
    const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ...headers, ETag: etag } });
    return new Response(body, { headers: { ...headers, ETag: etag, "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="offlog.ics"' } });
  } catch {
    // Never turn a database failure into an empty calendar that could delete subscribed events.
    return new Response("Calendar temporarily unavailable. Please try again later.", { status: 503, headers: { ...headers, "Retry-After": "300" } });
  }
}
