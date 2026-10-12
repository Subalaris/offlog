"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { profileSchema } from "@/lib/profile";
import { randomUUID } from "node:crypto";
import { MAX_PROFILE_PHOTO_BYTES, PROFILE_PHOTO_BUCKET, photoFormat, profilePhotoPath } from "@/lib/profilePhoto";

export async function uploadProfilePhoto(formData: FormData) {
  const user = await requireUser();
  const file = formData.get("photo");
  if (!(file instanceof File) || !file.size || file.size > MAX_PROFILE_PHOTO_BYTES) {
    return { error: "Choose a photo smaller than 2 MB.", path: null };
  }
  const format = photoFormat(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  if (!format || format.mime !== file.type) return { error: "Choose a JPEG, PNG, or WebP photo.", path: null };
  const supabase = await createClient();
  const storage = supabase.storage.from(PROFILE_PHOTO_BUCKET);
  const path = `${user.id}/profile/${randomUUID()}.${format.extension}`;
  const { error: uploadError } = await storage.upload(path, file, { contentType: format.mime, upsert: false });
  if (uploadError) return { error: "Could not upload your photo. Please try again.", path: null };
  let saved = false;
  try {
    const { error } = await supabase.auth.updateUser({ data: { avatar_path: path } });
    saved = !error;
  } catch { /* Restore the previous photo if the account update fails. */ }
  if (!saved) {
    await storage.remove([path]).catch(() => {});
    return { error: "Could not save your photo. Please try again.", path: null };
  }
  const previous = profilePhotoPath(user.user_metadata, user.id);
  if (previous) await storage.remove([previous]).catch(() => {});
  revalidatePath("/", "layout");
  return { error: null, path };
}

export async function removeProfilePhoto() {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { avatar_path: null } });
  if (error) return { error: "Could not remove your photo. Please try again." };
  const previous = profilePhotoPath(user.user_metadata, user.id);
  if (previous) await supabase.storage.from(PROFILE_PHOTO_BUCKET).remove([previous]).catch(() => {});
  revalidatePath("/", "layout");
  return { error: null };
}

export async function saveProfile(formData: FormData) {
  await requireUser();
  const parsed = profileSchema.safeParse({
    display_name: formData.get("display_name"),
    home_city: formData.get("home_city"),
    home_country: formData.get("home_country"),
    preferred_currency: formData.get("preferred_currency"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ data: parsed.data });
    if (error) return { error: error.message };
  } catch {
    return { error: "Could not save your profile. Please try again." };
  }
  revalidatePath("/", "layout");
  return { error: null };
}
