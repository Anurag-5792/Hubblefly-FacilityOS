import { NextRequest, NextResponse } from 'next/server';
import { authorizeFacilityRequest } from '../../../../lib/auth/server-guard';
import { getReconciliationSummary } from '../../../../lib/reconciliation/provider';

export async function GET(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['inventory']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }
  const result = await getReconciliationSummary();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
