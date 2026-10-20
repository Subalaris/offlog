import "server-only";
import { createClient } from "./supabase/server";

export interface CalendarSubscriptionState { available: boolean; token: string | null; error: string | null }

export async function getCalendarSubscription(ownerId: string): Promise<CalendarSubscriptionState> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("calendar_subscriptions").select("token").eq("owner_id", ownerId).maybeSingle();
    if (error && ["PGRST205", "42P01"].includes(error.code)) return { available: false, token: null, error: null };
    if (error) throw error;
    return { available: true, token: data?.token ?? null, error: null };
  } catch {
    return { available: true, token: null, error: "Could not load your calendar connection. Refresh to try again." };
  }
}
