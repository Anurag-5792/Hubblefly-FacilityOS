import { NextRequest, NextResponse } from "next/server";

import {
  FACILITYOS_SESSION_COOKIE,
  previewSession,
  readFrappeIdentity,
  usesFrappeAuth,
} from "../../../../lib/auth/frappe-session";
import { facilityAuthSource } from "../../../../lib/auth/source";
import { authenticatedUserFromRequest } from "../../../../lib/auth/current-user";
import {
  applySupabaseCookieMutations,
  type SupabaseCookieMutation,
} from "../../../../lib/supabase/route";
import { ApplicationError, serializePublicError } from "../../../../src/platform/primitives";

export async function GET(request: NextRequest) {
  if (facilityAuthSource() === "supabase") {
    const mutations: SupabaseCookieMutation[] = [];
    try {
      const current = await authenticatedUserFromRequest(request, mutations);
      const response = NextResponse.json({
        ok: true,
        source: "supabase",
        authenticated: true,
        facilityUserId: current.facilityUserId,
        authUserId: current.authUserId,
        fullName: current.displayName,
        email: current.email ?? null,
        status: current.status,
      });
      applySupabaseCookieMutations(response, mutations);
      return response;
    } catch (error) {
      const response = NextResponse.json({
        ok: false,
        error: error instanceof ApplicationError
          ? serializePublicError(error).message
          : "FacilityOS authentication could not be resolved.",
      }, { status: error instanceof ApplicationError && error.code === "AUTHENTICATION_REQUIRED" ? 401 : 403 });
      applySupabaseCookieMutations(response, mutations);
      return response;
    }
  }

  if (!usesFrappeAuth()) return NextResponse.json(previewSession());

  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value ?? "";
  const session = await readFrappeIdentity(sid);
  return NextResponse.json(session, { status: session.authenticated ? 200 : 401 });
}
