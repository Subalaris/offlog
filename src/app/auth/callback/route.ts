import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeAuthDestination } from "@/lib/authRedirect";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const destination = safeAuthDestination(url.searchParams.get("next"));
  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, url.origin));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };

  if (code || (tokenHash && (type === "email" || type === "signup" || type === "magiclink" || type === "email_change"))) {
    try {
      const supabase = await createClient();
      const { error } = code
        ? await supabase.auth.exchangeCodeForSession(code)
        : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type as "email" | "signup" | "magiclink" | "email_change" });
      if (!error) return redirect(destination);
    } catch {
      // Show a recoverable sign-in error without exposing codes or provider details.
    }
  }
  const query = new URLSearchParams({ error: "email_link", next: destination });
  return redirect(`/login?${query}`);
}
