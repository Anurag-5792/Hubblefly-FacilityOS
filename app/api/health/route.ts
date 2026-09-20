import { NextResponse } from 'next/server';
import { testErpNextConnection } from '../../../lib/erpnext/server-client';

export async function GET() {
  const erpnext = await testErpNextConnection();
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
      misSource,
      operationsSource,
      writePostingEnabled: false,
      openingStockPostingEnabled: false,
    },
  });
}
