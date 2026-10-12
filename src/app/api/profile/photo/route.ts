import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MAX_PROFILE_PHOTO_BYTES, PROFILE_PHOTO_BUCKET, photoFormat, profilePhotoPath } from "@/lib/profilePhoto";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401, headers });
  const path = profilePhotoPath(user.user_metadata, user.id);
  if (!path) return new Response("Not found", { status: 404, headers });
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(PROFILE_PHOTO_BUCKET).download(path);
  if (error || !data || data.size > MAX_PROFILE_PHOTO_BYTES) return new Response("Not found", { status: 404, headers });
  const format = photoFormat(new Uint8Array(await data.slice(0, 12).arrayBuffer()));
  if (!format) return new Response("Not found", { status: 404, headers });
  return new Response(data, { headers: { ...headers, "Content-Type": format.mime, "Content-Length": String(data.size) } });
}
