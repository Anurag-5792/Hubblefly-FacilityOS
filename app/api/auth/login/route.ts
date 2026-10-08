import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  FACILITYOS_SESSION_COOKIE,
  loginToFrappe,
  previewSession,
  readFrappeIdentity,
  usesFrappeAuth,
} from "../../../../lib/auth/frappe-session";
import { facilityAuthSource } from "../../../../lib/auth/source";
import { operationContextFromHeaders } from "../../../../lib/auth/request-context";
import { resolveVerifiedSupabaseUser } from "../../../../lib/auth/current-user";
import {
  applySupabaseCookieMutations,
  createRouteSupabaseClient,
  type SupabaseCookieMutation,
} from "../../../../lib/supabase/route";
import { ApplicationError, serializePublicError } from "../../../../src/platform/primitives";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(1024),
});

export async function POST(request: NextRequest) {
  const source = facilityAuthSource();
  if (source === "preview") return NextResponse.json(previewSession());

  let input;
  try {
    input = loginSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid login request." }, { status: 400 });
  }

  if (source === "supabase") {
    const mutations: SupabaseCookieMutation[] = [];
    const supabase = createRouteSupabaseClient(request, mutations);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.username,
      password: input.password,
    });
    if (error || !data.user) {
      return NextResponse.json({ ok: false, error: "Invalid email or password." }, { status: 401 });
    }

    try {
      const current = await resolveVerifiedSupabaseUser(
        data.user,
        operationContextFromHeaders(request.headers),
      );
      const response = NextResponse.json({
        ok: true,
        source: "supabase",
        authenticated: true,
        user: current.facilityUserId,
        fullName: current.displayName,
      });
      applySupabaseCookieMutations(response, mutations);
      return response;
    } catch (error) {
      await supabase.auth.signOut().catch(() => undefined);
      const response = NextResponse.json({
        ok: false,
        error: error instanceof ApplicationError
          ? serializePublicError(error).message
          : "FacilityOS login could not be completed.",
      }, { status: 403 });
      applySupabaseCookieMutations(response, mutations);
      return response;
    }
  }

  if (!usesFrappeAuth()) return NextResponse.json(previewSession());

  try {
    const sid = await loginToFrappe(input.username, input.password);
    const session = await readFrappeIdentity(sid);
    if (!session.authenticated) {
      return NextResponse.json({ ok: false, error: session.error ?? "Login failed." }, { status: 401 });
    }

    const response = NextResponse.json(session);
    response.cookies.set(FACILITYOS_SESSION_COOKIE, sid, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return response;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid username/password or login failed." }, { status: 401 });
  }
}
