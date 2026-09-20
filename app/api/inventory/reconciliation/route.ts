import { NextResponse } from 'next/server';
import { getReconciliationSummary } from '../../../../lib/reconciliation/provider';

export async function GET() {
  const result = await getReconciliationSummary();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
