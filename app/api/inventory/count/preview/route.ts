import { NextResponse } from 'next/server';
import { validateCount } from '../../../../../lib/inventory-workflows';

export async function POST(request: Request) {
  const body = await request.json();
  const result = validateCount({
    target: String(body.target ?? ''),
    quantity: Number(body.quantity ?? 0),
    condition: body.condition ? String(body.condition) : undefined,
    container: body.container ? String(body.container) : undefined,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
