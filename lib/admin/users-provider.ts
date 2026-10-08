import type { FacilityRoleUpdateResponse, FacilityUsersResponse } from './users-types';

const roles = [
  'FacilityOS Inventory',
  'FacilityOS Shopfloor',
  'FacilityOS MIS',
  'FacilityOS Admin',
];

const preview: FacilityUsersResponse = {
  ok: true,
  source: 'preview',
  availableRoles: roles,
  users: [
    { user: 'inventory.preview@facilityos.local', fullName: 'Inventory Preview', email: 'inventory.preview@facilityos.local', roles: ['FacilityOS Inventory'], lastLogin: null },
    { user: 'shopfloor.preview@facilityos.local', fullName: 'Shopfloor Preview', email: 'shopfloor.preview@facilityos.local', roles: ['FacilityOS Shopfloor'], lastLogin: null },
    { user: 'mis.preview@facilityos.local', fullName: 'MIS Preview', email: 'mis.preview@facilityos.local', roles: ['FacilityOS MIS'], lastLogin: null },
    { user: 'admin.preview@facilityos.local', fullName: 'Admin Preview', email: 'admin.preview@facilityos.local', roles: ['FacilityOS Admin'], lastLogin: null },
  ],
};

function live() {
  return process.env.FACILITYOS_OPERATIONS_SOURCE === 'frappe'
    || process.env.FACILITYOS_AUTH_SOURCE === 'frappe';
}

function baseUrl() {
  return process.env.ERPNEXT_BASE_URL?.replace(/\/$/, '') ?? '';
}

export async function getFacilityUsers(sid?: string): Promise<FacilityUsersResponse> {
  if (!live()) return preview;
  if (!sid || !baseUrl()) {
    return { ok: false, source: 'facilityos', users: [], availableRoles: roles, error: 'FacilityOS session or server URL is unavailable.' };
  }

  try {
    const response = await fetch(baseUrl() + '/api/method/facility_os.api.users.list_users', {
      headers: { Accept: 'application/json', Cookie: 'sid=' + sid },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('User list failed.');
    const payload = await response.json() as { message?: Omit<FacilityUsersResponse, 'source'> };
    if (!payload.message) throw new Error('Empty user response.');
    return { ...payload.message, source: 'facilityos' };
  } catch {
    return { ok: false, source: 'facilityos', users: [], availableRoles: roles, error: 'FacilityOS users could not be loaded.' };
  }
}

export async function updateFacilityUserRoles(user: string, userRoles: string[], sid?: string): Promise<FacilityRoleUpdateResponse> {
  if (!live()) {
    return {
      ok: true,
      persisted: false,
      user,
      roles: userRoles,
      note: 'Preview mode: role assignment was not persisted.',
    };
  }

  if (!sid || !baseUrl()) {
    return { ok: false, persisted: false, error: 'FacilityOS session or server URL is unavailable.' };
  }

  try {
    const response = await fetch(baseUrl() + '/api/method/facility_os.api.users.set_roles', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Cookie: 'sid=' + sid,
      },
      body: JSON.stringify({ user, roles: userRoles }),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Role update failed.');
    const payload = await response.json() as { message?: { ok?: boolean; user?: string; roles?: string[]; note?: string } };
    if (!payload.message?.ok) throw new Error('Role update failed.');
    return {
      ok: true,
      persisted: true,
      user: payload.message.user,
      roles: payload.message.roles,
      note: payload.message.note,
    };
  } catch {
    return { ok: false, persisted: false, error: 'FacilityOS roles could not be updated.' };
  }
}
