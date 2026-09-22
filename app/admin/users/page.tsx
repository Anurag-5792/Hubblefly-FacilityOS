'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FacilityRoleUpdateResponse, FacilityUser, FacilityUsersResponse } from '../../../lib/admin/users-types';

export default function AdminUsersPage() {
  const [data, setData] = useState<FacilityUsersResponse | null>(null);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [result, setResult] = useState<FacilityRoleUpdateResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/users', { cache: 'no-store' });
    const payload = await response.json() as FacilityUsersResponse;
    setData(payload);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const user = useMemo<FacilityUser | undefined>(
    () => data?.users.find((entry) => entry.user === selectedUser),
    [data, selectedUser],
  );

  useEffect(() => {
    setSelectedRoles(user?.roles ?? []);
  }, [user]);

  function toggleRole(role: string) {
    setSelectedRoles((current) => current.includes(role)
      ? current.filter((value) => value !== role)
      : [...current, role]);
  }

  async function saveRoles() {
    if (!selectedUser) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: selectedUser, roles: selectedRoles }),
      });
      const payload = await response.json() as FacilityRoleUpdateResponse;
      setResult(payload);
      if (payload.ok) await load();
    } catch {
      setResult({ ok: false, persisted: false, error: 'Role update could not be completed.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workflow-page role-workspace">
      <header className="role-hero role-hero-admin">
        <div>
          <Link className="back-link role-back" href="/admin">← Admin Workspace</Link>
          <p className="eyebrow">Users & Roles</p>
          <h1>FacilityOS Access Control</h1>
          <p className="lead">Assign only FacilityOS roles here. Existing unrelated Frappe/ERPNext roles remain untouched.</p>
        </div>
        <div className="role-identity-card">
          <span>Control</span>
          <strong>Admin Only</strong>
          <small>Inventory · Shopfloor · MIS · Admin</small>
        </div>
      </header>

      {data?.error && <div className="lookup-warning" style={{ marginBottom: 16 }}>{data.error}</div>}

      <section className="role-two-column">
        <section className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Directory</p><h2>System users</h2></div>
            <span className={data?.source === 'facilityos' ? 'preview-badge live-badge' : 'preview-badge'}>
              {data?.source === 'facilityos' ? 'Frappe users' : 'Preview users'}
            </span>
          </div>

          <div className="admin-user-list">
            {(data?.users ?? []).map((entry) => (
              <button
                className={selectedUser === entry.user ? 'admin-user-row admin-user-row-active' : 'admin-user-row'}
                key={entry.user}
                type="button"
                onClick={() => setSelectedUser(entry.user)}
              >
                <div>
                  <strong>{entry.fullName}</strong>
                  <small>{entry.email}</small>
                </div>
                <span>{entry.roles.length ? entry.roles.map((role) => role.replace('FacilityOS ', '')).join(', ') : 'No FacilityOS role'}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Assignment</p><h2>{user ? user.fullName : 'Select a user'}</h2></div>
          </div>

          {!user ? (
            <div className="preview-note">Choose a user from the directory to review or change FacilityOS access.</div>
          ) : (
            <>
              <dl className="result-fields">
                <div><dt>User</dt><dd>{user.user}</dd></div>
                <div><dt>Last login</dt><dd>{user.lastLogin ?? '—'}</dd></div>
              </dl>

              <div className="role-checkbox-grid">
                {(data?.availableRoles ?? []).map((role) => (
                  <label className={selectedRoles.includes(role) ? 'role-checkbox role-checkbox-selected' : 'role-checkbox'} key={role}>
                    <input type="checkbox" checked={selectedRoles.includes(role)} onChange={() => toggleRole(role)} />
                    <div>
                      <strong>{role.replace('FacilityOS ', '')}</strong>
                      <small>{role === 'FacilityOS Inventory' ? 'Store/count/reconciliation operations' : role === 'FacilityOS Shopfloor' ? 'Assembly/route-card/genealogy' : role === 'FacilityOS MIS' ? 'Read-only analytics' : 'Approvals/configuration'}</small>
                    </div>
                  </label>
                ))}
              </div>

              {selectedRoles.includes('FacilityOS Inventory') && selectedRoles.includes('FacilityOS Admin') && (
                <div className="lookup-warning" style={{ marginTop: 14 }}>
                  Dual Inventory + Admin access is allowed only where necessary. The validation workflow still blocks the same user from approving a session they validated.
                </div>
              )}

              <div className="workflow-actions" style={{ marginTop: 16 }}>
                <button className="scan-primary" type="button" disabled={busy} onClick={() => void saveRoles()}>
                  {busy ? 'Saving…' : 'Save FacilityOS Roles'}
                </button>
              </div>
            </>
          )}
        </section>
      </section>

      {result && (
        <section className={result.ok ? 'panel workflow-result success' : 'panel workflow-result error'}>
          <p className="eyebrow">Role update</p>
          <h2>{result.ok ? 'FacilityOS access updated' : 'Role update failed'}</h2>
          {result.error && <div className="lookup-warning">{result.error}</div>}
          {result.ok && <dl className="result-fields"><div><dt>Persisted</dt><dd>{result.persisted ? 'Yes' : 'No — preview mode'}</dd></div><div><dt>Roles</dt><dd>{result.roles?.join(', ') || 'None'}</dd></div></dl>}
          {result.note && <div className="preview-note" style={{ marginTop: 12 }}>{result.note}</div>}
        </section>
      )}

      <section className="role-rule-strip">
        <strong>Access rule:</strong> this screen only manages FacilityOS roles. It must never silently remove or rewrite unrelated ERPNext/Frappe permissions.
      </section>
    </main>
  );
}
