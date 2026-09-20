import { NextRequest, NextResponse } from 'next/server';
import { FACILITYOS_SESSION_COOKIE } from '../../../../lib/auth/frappe-session';
import { runSyncNow } from '../../../../lib/sync/provider';

export async function POST(request: NextRequest) {
  const sid = request.cookies.get(FACILITYOS_SESSION_COOKIE)?.value;
  const payload = await runSyncNow(sid);
  return NextResponse.json(payload, { status: payload.ok ? 200 : 403 });
}
