import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

import { resolveActiveFacilityProfile } from "./lib/auth/current-user";
import { FACILITYOS_SESSION_COOKIE } from "./lib/auth/frappe-session";
import { facilityAuthSource } from "./lib/auth/source";
import { getSupabasePublicConfig } from "./lib/supabase/config";

interface CookieMutation {
  readonly name: string;
  readonly value: string;
  readonly options: CookieOptions;
}

function loginRedirect(request: NextRequest, mutations: readonly CookieMutation[]) {
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);

  const response = NextResponse.redirect(login);
  for (const { name, value, options } of mutations) {
    response.cookies.set(name, value, options);
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const source = facilityAuthSource();

  if (source === "frappe") {
    const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value;
    if (sid) return NextResponse.next();
    return loginRedirect(request, []);
  }

  if (source !== "supabase") return NextResponse.next();

  const { url, publishableKey } = getSupabasePublicConfig();
  const mutations: CookieMutation[] = [];

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          mutations.push({ name, value, options });
        }
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const authUserId = data?.claims?.sub;

  if (error || !authUserId) {
    return loginRedirect(request, mutations);
  }

  try {
    await resolveActiveFacilityProfile(authUserId);
  } catch {
    return loginRedirect(request, mutations);
  }

  const response = NextResponse.next({ request });
  for (const { name, value, options } of mutations) {
    response.cookies.set(name, value, options);
  }
  return response;
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
