import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDocument } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const INLINE = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string; filename: string }> },
) {
  if (!(await getCurrentUser())) return new Response("unauthorized", { status: 401 });

  const { tripId, filename } = await params;
  const document = await getDocument(tripId, decodeURIComponent(filename));
  if (!document) return new Response("not found", { status: 404 });

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("trip-documents")
    .download(document.storage_path);
  if (error || !data) return new Response("not found", { status: 404 });

  const disposition = INLINE.has(document.mime) ? "inline" : "attachment";
  const safeName = document.filename.replace(/["\r\n]/g, "");
  return new NextResponse(data, {
    headers: {
      "content-type": document.mime,
      "content-length": String(document.size),
      "content-disposition": `${disposition}; filename="${safeName}"`,
      "cache-control": "private, no-store",
    },
  });
}
