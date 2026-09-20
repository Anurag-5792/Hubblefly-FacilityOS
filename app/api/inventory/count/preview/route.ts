import { NextResponse } from 'next/server';
import { validateCount } from '../../../../../lib/inventory-workflows';

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, errors: ['Invalid JSON body.'] }, { status: 400 });
  }

  const result = validateCount({
    target: String(body.target ?? ''),
    quantity: Number(body.quantity ?? 0),
    condition: body.condition ? String(body.condition) : undefined,
    container: body.container ? String(body.container) : undefined,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
