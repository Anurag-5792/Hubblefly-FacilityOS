import { NextRequest, NextResponse } from 'next/server';
import { authorizeFacilityRequest } from '../../../../../lib/auth/server-guard';
import { FACILITYOS_SESSION_COOKIE } from '../../../../../lib/auth/frappe-session';
import { approvePrintJob } from '../../../../../lib/documents/provider';

export async function POST(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['admin']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, persisted: false, error: authorization.error }, { status: authorization.status });
  }

  let body: { jobId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, persisted: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const jobId = String(body.jobId ?? '').trim();
  if (!jobId) {
    return NextResponse.json({ ok: false, persisted: false, error: 'Print Job ID is required.' }, { status: 400 });
  }

  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value;
  const result = await approvePrintJob(jobId, sid);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
