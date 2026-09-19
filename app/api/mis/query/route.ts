import { NextRequest, NextResponse } from 'next/server';
import { queryMis } from '../../../../lib/mis/provider';
import type { MisFilters, MisPeriod } from '../../../../lib/mis/types';

const allowedPeriods = new Set<MisPeriod>(['Today', '7 Days', '30 Days', 'Custom']);

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const requestedPeriod = (search.get('period') ?? 'Today') as MisPeriod;

  const filters: MisFilters = {
    period: allowedPeriods.has(requestedPeriod) ? requestedPeriod : 'Today',
    company: search.get('company') ?? 'Hubblefly Technologies Limited',
    warehouse: search.get('warehouse') ?? 'HFT Store',
    module: search.get('module') ?? 'Inventory',
    metric: search.get('metric') ?? 'Stock Qty',
    groupBy: search.get('groupBy') ?? 'Item Group',
  };

  return NextResponse.json(await queryMis(filters));
}
