import { NextRequest, NextResponse } from 'next/server';
import { authorizeFacilityRequest } from '../../../lib/auth/server-guard';
import { testErpNextConnection, testFacilityOsBackend } from '../../../lib/erpnext/server-client';

export async function GET(request: NextRequest) {
  const authorization = await authorizeFacilityRequest(request, ['admin']);
  if (!authorization.ok) {
    return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status });
  }
  const [erpnext, backend] = await Promise.all([
    testErpNextConnection(),
    testFacilityOsBackend(),
  ]);
  const misSource = process.env.FACILITYOS_MIS_SOURCE === 'frappe' ? 'frappe' : 'sample';
  const operationsSource = process.env.FACILITYOS_OPERATIONS_SOURCE === 'frappe'
    || (!process.env.FACILITYOS_OPERATIONS_SOURCE && misSource === 'frappe')
    ? 'frappe'
    : 'sample';

  return NextResponse.json({
    ok: true,
    service: 'Hubblefly FacilityOS',
    erpnext,
    facilityos: {
      backend,
      misSource,
      operationsSource,
      writePostingEnabled: false,
      openingStockPostingEnabled: false,
    },
  });
}
