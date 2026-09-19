import { NextResponse } from 'next/server';
import { validateMove } from '../../../../../lib/inventory-workflows';

export async function POST(request: Request) {
  const body = await request.json();
  const result = validateMove({
    source: String(body.source ?? ''),
    destination: String(body.destination ?? ''),
    quantity: Number(body.quantity ?? 0),
    condition: body.condition ? String(body.condition) : undefined,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
