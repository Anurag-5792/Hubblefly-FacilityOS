'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { FacilityUsersResponse } from '../../lib/admin/users-types';
import type { ReconciliationSummary } from '../../lib/reconciliation/types';
import type { SyncStatusResponse } from '../../lib/sync/types';

type Health = {
  ok: boolean;
  erpnext?: { configured?: boolean; reachable?: boolean; authenticated?: boolean };
  facilityos?: {
    backend?: { installed?: boolean; ready?: boolean; version?: string | null; missingDoctypes?: string[] };
    misSource?: string;
    operationsSource?: string;
    writePostingEnabled?: boolean;
    openingStockPostingEnabled?: boolean;
  };
};

export default function AdminWorkspace() {
  const [health, setHealth] = useState<Health | null>(null);
  const [sync, setSync] = useState<SyncStatusResponse | null>(null);
  const [users, setUsers] = useState<FacilityUsersResponse | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationSummary | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/health', { cache: 'no-store' }).then((response) => response.json()),
      fetch('/api/sync/status', { cache: 'no-store' }).then((response) => response.json()),
      fetch('/api/admin/users', { cache: 'no-store' }).then((response) => response.json()),
      fetch('/api/inventory/reconciliation', { cache: 'no-store' }).then((response) => response.json()),
    ]).then(([healthPayload, syncPayload, usersPayload, reconciliationPayload]) => {
      setHealth(healthPayload as Health);
      setSync(syncPayload as SyncStatusResponse);
      setUsers(usersPayload as FacilityUsersResponse);
      setReconciliation(reconciliationPayload as ReconciliationSummary);
    }).catch(() => undefined);
  }, []);

  const syncHealthy = useMemo(
    () => sync?.projections?.filter((projection) => projection.status === 'healthy').length ?? 0,
    [sync],
  );
  const syncTotal = sync?.projections?.length ?? 0;
  const adminUsers = users?.users?.filter((user) => user.roles.includes('FacilityOS Admin')).length ?? 0;
  const approvalReady = reconciliation?.validationStatus === 'Inventory Validated' && (reconciliation?.blockingExceptions ?? 0) === 0;

  return (
    <main className="workflow-page role-workspace">
      <header className="role-hero role-hero-admin">
        <div>
          <Link className="back-link role-back" href="/roles">← Role Workspaces</Link>
          <p className="eyebrow">Administrator</p>
          <h1>Controls & Approvals</h1>
          <p className="lead">Validation approvals, users/roles, integration health, read-model sync, master-data readiness and release gates in one controlled workspace.</p>
        </div>
        <div className="role-identity-card">
          <span>Role</span><strong>Admin</strong><small>Approval + configuration authority</small>
        </div>
      </header>

      <section className="role-kpi-grid">
        <article className="role-kpi"><span>Approval Queue</span><strong>{approvalReady ? 'Ready' : 'Waiting'}</strong><small>{reconciliation?.validationStatus ?? 'No validated session yet'}</small></article>
        <article className="role-kpi"><span>FacilityOS Backend</span><strong>{health?.facilityos?.backend?.ready ? 'Ready' : health?.facilityos?.backend?.installed ? 'Incomplete' : 'Pending'}</strong><small>{health?.facilityos?.backend?.version ?? 'Install/migrate before live UAT'}</small></article>
        <article className="role-kpi"><span>Read-model Sync</span><strong>{syncTotal ? syncHealthy + '/' + syncTotal : '—'}</strong><small>Healthy projections</small></article>
        <article className="role-kpi role-kpi-gate"><span>ERP Writes</span><strong>{health?.facilityos?.writePostingEnabled ? 'Enabled' : 'Disabled'}</strong><small>Opening stock remains separately gated</small></article>
      </section>

      <div className="role-two-column">
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Approval Control</p><h2>Inventory validation</h2></div><span className="status">Segregation of duties</span></div>
          <div className="admin-stage-list">
            <div className="done"><span>1</span><div><strong>Physical Count</strong><small>Inventory records physical truth</small></div></div>
            <div className={(reconciliation?.blockingExceptions ?? 0) === 0 ? 'done' : ''}><span>2</span><div><strong>Reconciliation</strong><small>{reconciliation?.blockingExceptions ?? 0} blocking exception(s)</small></div></div>
            <div className={reconciliation?.validationStatus === 'Inventory Validated' || reconciliation?.validationStatus === 'Admin Approved' ? 'done' : ''}><span>3</span><div><strong>Inventory Validation</strong><small>{reconciliation?.validationStatus ?? 'Not started'}</small></div></div>
            <div className={reconciliation?.validationStatus === 'Admin Approved' ? 'done' : ''}><span>4</span><div><strong>Admin Approval</strong><small>Different user reviews and approves</small></div></div>
            <div className="locked"><span>5</span><div><strong>Opening Stock Posting</strong><small>Separate future posting control</small></div></div>
          </div>
          <Link className="scan-primary scan-link" href="/inventory/reconciliation/validation">Open Approval Queue</Link>
        </section>

        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">System</p><h2>Health & integration</h2></div></div>
          <div className="role-mini-grid">
            <Link href="/admin/integrations"><strong>Connection Health</strong><span>ERPNext + FacilityOS backend readiness</span></Link>
            <Link href="/admin/sync"><strong>Sync Status</strong><span>{syncHealthy}/{syncTotal || '—'} projections healthy</span></Link>
            <Link href="/inventory/traceability"><strong>Traceability Gate</strong><span>{reconciliation?.blockingExceptions ?? '—'} blocker(s) affecting approval</span></Link>
            <Link href="/mis"><strong>MIS Verification</strong><span>Review synchronized analytical views</span></Link>
          </div>
        </section>
      </div>

      <section className="panel" id="audit" style={{ marginBottom: 16 }}>
        <div className="panel-heading"><div><p className="eyebrow">Governance</p><h2>Admin responsibilities</h2></div><span className="status">{adminUsers} Admin user(s)</span></div>
        <div className="admin-control-grid">
          <article><strong>Users & Roles</strong><p>Assign Inventory, Shopfloor, MIS and Admin permissions while preserving unrelated ERPNext roles.</p><Link className="mis-link" href="/admin/users">Manage Access →</Link></article>
          <article><strong>Master Data</strong><p>Review Item, Serial, Batch, Position and Container readiness before migration/posting.</p><Link className="mis-link" href="/inventory/reconciliation">Review Reconciliation →</Link></article>
          <article><strong>Audit Trail</strong><p>Review who counted, moved, validated, approved or resolved exceptions and when.</p><Link className="mis-link" href="/inventory/reconciliation/validation">Validation History →</Link></article>
          <article><strong>Release Gates</strong><p>Keep ERP stock writes and opening-stock posting blocked until live UAT and explicit approval.</p><Link className="mis-link" href="/admin/integrations">Review Gates →</Link></article>
        </div>
      </section>

      <section className="role-rule-strip">
        <strong>Admin rule:</strong> approval is oversight, not a shortcut. Admin cannot bypass Inventory validation or use approval to hide unresolved traceability/reconciliation exceptions.
      </section>
    </main>
  );
}
