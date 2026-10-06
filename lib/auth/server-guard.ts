import type { NextRequest } from "next/server";
import { authenticatedUserFromRequest } from "./current-user";
import { FACILITYOS_SESSION_COOKIE, previewSession, readFrappeIdentity, usesFrappeAuth } from "./frappe-session";
import { facilityAuthSource } from "./source";
import type { FacilityRole, FacilitySession } from "./types";
import type { AuthenticatedUser } from "../../src/domains/iam";

export type FacilityAuthorization = {
  ok: boolean;
  status: number;
  session: FacilitySession | null;
  authenticatedUser?: Readonly<AuthenticatedUser>;
  error?: string;
};

export async function authorizeFacilityRequest(
  request: NextRequest,
  allowedRoles: FacilityRole[] = [],
): Promise<FacilityAuthorization> {
  if (facilityAuthSource() === "supabase") {
    try {
      const current = await authenticatedUserFromRequest(request);
      const session: FacilitySession = {
        ok: true,
        source: "supabase",
        authenticated: true,
        user: current.facilityUserId,
        fullName: current.displayName,
        role: "unknown",
        roles: [],
      };
      if (allowedRoles.length > 0) {
        return {
          ok: false,
          status: 403,
          session,
          authenticatedUser: current,
          error: "FacilityOS authorization is not configured for Supabase users yet.",
        };
      }
      return { ok: true, status: 200, session, authenticatedUser: current };
    } catch {
      return { ok: false, status: 401, session: null, error: "FacilityOS authentication is required." };
    }
  }

  const frappeAuth = usesFrappeAuth();
  const session = frappeAuth
    ? await readFrappeIdentity(request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value ?? "")
    : previewSession();

  if (!session.authenticated) {
    return { ok: false, status: 401, session: null, error: "FacilityOS authentication is required." };
  }

  if (frappeAuth && allowedRoles.length > 0 && session.role !== "admin" && !allowedRoles.includes(session.role)) {
    return { ok: false, status: 403, session, error: "Your FacilityOS role is not permitted for this action." };
  }

  return { ok: true, status: 200, session };
}
