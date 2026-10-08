import { NextRequest, NextResponse } from "next/server";

import {
  FACILITYOS_SESSION_COOKIE,
  logoutFrappe,
  usesFrappeAuth,
} from "../../../../lib/auth/frappe-session";
import { facilityAuthSource } from "../../../../lib/auth/source";
import {
  applySupabaseCookieMutations,
  createRouteSupabaseClient,
  type SupabaseCookieMutation,
} from "../../../../lib/supabase/route";

export async function POST(request: NextRequest) {
  if (facilityAuthSource() === "supabase") {
    const mutations: SupabaseCookieMutation[] = [];
    const supabase = createRouteSupabaseClient(request, mutations);
    await supabase.auth.signOut();
    const response = NextResponse.json({ ok: true });
    applySupabaseCookieMutations(response, mutations);
    return response;
  }

  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value ?? "";
  if (usesFrappeAuth()) await logoutFrappe(sid);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(FACILITYOS_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
