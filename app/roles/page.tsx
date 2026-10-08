'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { FacilitySession } from '../../lib/auth/types';
import { roleWorkspaces } from '../../lib/roles/role-config';

export default function RoleWorkspacesPage() {
  const [session, setSession] = useState<FacilitySession | null>(null);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload: FacilitySession) => setSession(payload))
      .catch(() => undefined);
  }, []);

  return (
    <main className="workflow-page role-gallery-page">
      <header className="scan-header">
        <div>
          <Link className="back-link" href="/">← FacilityOS</Link>
          <p className="eyebrow">Role Workspaces</p>
          <h1>Choose the work view</h1>
          <p className="lead">Each role gets a focused workspace instead of one overloaded ERP-style dashboard. Actions are limited by the signed-in FacilityOS role.</p>
        </div>
        <span className={session?.source === 'frappe' ? 'preview-badge live-badge' : 'preview-badge'}>
          {session?.source === 'frappe'
            ? (session.fullName ?? session.user ?? 'Signed-in user') + ' · ' + session.role
            : 'Preview roles'}
        </span>
      </header>

      <section className="role-card-grid">
        {roleWorkspaces.map((workspace) => {
          const active = session?.role === workspace.role;
          return (
            <article className={active ? 'role-card role-card-active' : 'role-card'} key={workspace.role}>
              <div className="role-card-top">
                <div>
                  <p className="eyebrow">{workspace.subtitle}</p>
                  <h2>{workspace.title}</h2>
                </div>
                {active && <span className="preview-badge live-badge">Your role</span>}
              </div>
              <p>{workspace.purpose}</p>

              <div className="role-action-list">
                {workspace.primaryActions.map((action) => (
                  <Link key={action.label} href={action.href}>{action.label}<span>→</span></Link>
                ))}
              </div>

              <div className="role-permission-list">
                {workspace.permissions.map((permission) => <span key={permission}>✓ {permission}</span>)}
              </div>

              <Link className="scan-primary scan-link" href={workspace.route}>Open {workspace.title} Workspace</Link>
            </article>
          );
        })}
      </section>
    </main>
  );
}
