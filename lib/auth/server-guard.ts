import type { NextRequest } from 'next/server';
import { FACILITYOS_SESSION_COOKIE, previewSession, readFrappeIdentity, usesFrappeAuth } from './frappe-session';
import type { FacilityRole, FacilitySession } from './types';

export type FacilityAuthorization = {
  ok: boolean;
  status: number;
  session: FacilitySession | null;
  error?: string;
};

export async function authorizeFacilityRequest(
  request: NextRequest,
  allowedRoles: FacilityRole[] = [],
): Promise<FacilityAuthorization> {
  const frappeAuth = usesFrappeAuth();
  const session = frappeAuth
    ? await readFrappeIdentity(request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value ?? '')
    : previewSession();

  if (!session.authenticated) {
    return { ok: false, status: 401, session: null, error: 'FacilityOS authentication is required.' };
  }

  // Preview/sample deployments intentionally allow navigating every role workspace.
  // Live Frappe auth still enforces the signed-in role server-side.
  if (frappeAuth && allowedRoles.length > 0 && session.role !== 'admin' && !allowedRoles.includes(session.role)) {
    return { ok: false, status: 403, session, error: 'Your FacilityOS role is not permitted for this action.' };
  }

  return { ok: true, status: 200, session };
}
