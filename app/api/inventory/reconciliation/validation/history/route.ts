import { NextRequest, NextResponse } from 'next/server';
import { authorizeFacilityRequest } from '../../../../../../lib/auth/server-guard';
import { FACILITYOS_SESSION_COOKIE } from '../../../../../../lib/auth/frappe-session';
import { getValidationHistory } from '../../../../../../lib/reconciliation/validation-history';

export async function GET(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['inventory', 'admin']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }
  const sessionName = request.nextUrl.searchParams.get('session')?.trim() ?? '';
  if (!sessionName) {
    return NextResponse.json({ ok: false, error: 'Validation session is required.' }, { status: 400 });
  }

  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value;
  const result = await getValidationHistory(sessionName, sid);
  return NextResponse.json(result, { status: result.ok ? 200 : 401 });
}
