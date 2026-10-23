import { NextResponse, type NextRequest } from 'next/server';
import { assertSecureStartup } from './lib/hft/security/authorization';

/**
 * Mandatory R1 engineering gate. This branch cannot serve a production session
 * or any HFT mutation API. A future production release requires explicit MASTER
 * authorization, a verified identity adapter and replacement of this guard.
 */
export function middleware(request: NextRequest) {
  try {
    assertSecureStartup(process.env);
  } catch {
    return NextResponse.json(
      { ok: false, error: 'HFT_R1_PRODUCTION_NOT_AUTHORIZED' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (request.nextUrl.pathname.startsWith('/api/hft/')) {
    return NextResponse.json(
      { ok: false, error: 'HFT_R1_API_NOT_QUALIFIED' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
