import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

import { FACILITYOS_SESSION_COOKIE } from "./lib/auth/frappe-session";
import { facilityAuthSource } from "./lib/auth/source";
import { getSupabasePublicConfig } from "./lib/supabase/config";

export async function proxy(request: NextRequest) {
  const source = facilityAuthSource();

  if (source === "frappe") {
    const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value;
    if (sid) return NextResponse.next();

    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }

  if (source !== "supabase") return NextResponse.next();

  const { url, publishableKey } = getSupabasePublicConfig();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) return response;

  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/inventory/:path*",
    "/mis/:path*",
    "/admin/:path*",
    "/shopfloor/:path*",
    "/roles/:path*",
    "/documents/:path*",
    "/labels/:path*",
  ],
};
