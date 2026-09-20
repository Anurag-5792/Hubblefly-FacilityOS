import type { FacilitySession } from './types';

export const FACILITYOS_SESSION_COOKIE = 'facilityos_sid';

function baseUrl() {
  return process.env.ERPNEXT_BASE_URL?.replace(/\/$/, '') ?? '';
}

function authSource() {
  return process.env.FACILITYOS_AUTH_SOURCE === 'frappe' ? 'frappe' : 'preview';
}

export function usesFrappeAuth() {
  return authSource() === 'frappe';
}

export function previewSession(): FacilitySession {
  const role = (process.env.FACILITYOS_PREVIEW_ROLE ?? 'inventory') as FacilitySession['role'];
  return {
    ok: true,
    source: 'preview',
    authenticated: true,
    user: process.env.FACILITYOS_PREVIEW_USER ?? 'preview@facilityos.local',
    fullName: process.env.FACILITYOS_PREVIEW_NAME ?? 'Preview User',
    role,
    roles: [role],
  };
}

export async function loginToFrappe(username: string, password: string) {
  const url = baseUrl();
  if (!url) throw new Error('Frappe base URL is not configured.');

  const response = await fetch(`${url}/api/method/login`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ usr: username, pwd: password }),
    cache: 'no-store',
  });

  if (!response.ok) throw new Error('Invalid username/password or Frappe login failed.');

  const setCookie = response.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/(?:^|[,;]\s*)sid=([^;,s]+)/i);
  if (!match?.[1]) throw new Error('Frappe login did not return a session.');

  return decodeURIComponent(match[1]);
}

export async function readFrappeIdentity(sid: string): Promise<FacilitySession> {
  const url = baseUrl();
  if (!url || !sid) {
    return {
      ok: false,
      source: 'frappe',
      authenticated: false,
      user: null,
      fullName: null,
      role: 'unknown',
      roles: [],
      error: 'No FacilityOS Frappe session is available.',
    };
  }

  try {
    const response = await fetch(`${url}/api/method/facility_os.api.auth.me`, {
      headers: {
        Accept: 'application/json',
        Cookie: `sid=${sid}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) throw new Error('Session validation failed.');
    const payload = await response.json() as {
      message?: { user?: string; full_name?: string; role?: FacilitySession['role']; roles?: string[] };
    };
    if (!payload.message?.user) throw new Error('Authenticated user was not returned.');

    return {
      ok: true,
      source: 'frappe',
      authenticated: true,
      user: payload.message.user,
      fullName: payload.message.full_name ?? payload.message.user,
      role: payload.message.role ?? 'unknown',
      roles: payload.message.roles ?? [],
    };
  } catch {
    return {
      ok: false,
      source: 'frappe',
      authenticated: false,
      user: null,
      fullName: null,
      role: 'unknown',
      roles: [],
      error: 'FacilityOS session is invalid or expired.',
    };
  }
}

export async function logoutFrappe(sid: string) {
  const url = baseUrl();
  if (!url || !sid) return;
  await fetch(`${url}/api/method/logout`, {
    method: 'POST',
    headers: { Cookie: `sid=${sid}` },
    cache: 'no-store',
  }).catch(() => undefined);
}
