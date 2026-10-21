import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeAuthDestination } from "@/lib/authRedirect";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // Calendar subscribers cannot sign in. The feed itself validates the revocable token.
  if (/^\/api\/calendar\/[a-f0-9]{64}$/.test(pathname)) return NextResponse.next({ request });
  // The callback must be reachable before a session exists.
  if (pathname === "/auth/callback") return NextResponse.next({ request });
  // Older/default email templates may redirect to the site root rather than the callback.
  if ((pathname === "/" || pathname === "/login") && request.nextUrl.searchParams.has("code")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    url.searchParams.set("next", safeAuthDestination(request.nextUrl.searchParams.get("next")));
    return NextResponse.redirect(url);
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const isLogin = pathname === "/login";
  const isApi = pathname.startsWith("/api/");

  if (!user && !isLogin && pathname !== "/") {
    if (isApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  if (user && isLogin) {
    const url = new URL(safeAuthDestination(request.nextUrl.searchParams.get("next")), request.url);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.json).*)"],
};
