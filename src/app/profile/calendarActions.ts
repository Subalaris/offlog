"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function enableCalendarSubscription(): Promise<{ token: string | null; error: string | null }> {
  const user = await requireUser();
  try {
    const supabase = await createClient();
    const token = randomBytes(32).toString("hex");
    const { error } = await supabase.from("calendar_subscriptions").upsert({ owner_id: user.id, token }, { onConflict: "owner_id" });
    if (error) throw error;
    revalidatePath("/profile");
    return { token, error: null };
  } catch { return { token: null, error: "Could not enable your calendar link. Please try again." }; }
}

export async function disableCalendarSubscription(): Promise<{ error: string | null }> {
  const user = await requireUser();
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("calendar_subscriptions").delete().eq("owner_id", user.id);
    if (error) throw error;
    revalidatePath("/profile");
    return { error: null };
  } catch { return { error: "Could not disconnect your calendar. Please try again." }; }
}
