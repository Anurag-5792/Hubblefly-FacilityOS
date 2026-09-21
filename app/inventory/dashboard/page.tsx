'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { ReconciliationSummary } from '../../../lib/reconciliation/types';
import type { TraceabilitySummary } from '../../../lib/traceability/types';

const primary = [
  ['Scan QR', '/inventory/scan', 'Scan serial, batch, position, container or SFG'],
  ['Physical Count', '/inventory/count', 'Record physical truth without posting ERP stock'],
  ['Move', '/inventory/move', 'Move stock or FacilityOS containers'],
  ['Receive', '/inventory/transaction?kind=receive', 'Prepare inward transaction'],
  ['Issue', '/inventory/transaction?kind=issue', 'Prepare outward transaction'],
  ['Return', '/inventory/transaction?kind=return', 'Prepare controlled return'],
];

export default function InventoryRoleDashboard() {
  const [reconciliation, setReconciliation] = useState<ReconciliationSummary | null>(null);
  const [traceability, setTraceability] = useState<TraceabilitySummary | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/inventory/reconciliation', { cache: 'no-store' }).then((response) => response.json()),
      fetch('/api/inventory/traceability', { cache: 'no-store' }).then((response) => response.json()),
    ]).then(([reconciliationData, traceabilityData]) => {
      setReconciliation(reconciliationData as ReconciliationSummary);
      setTraceability(traceabilityData as TraceabilitySummary);
    }).catch(() => undefined);
  }, []);

  const blockers = reconciliation?.blockingExceptions ?? traceability?.openBlocking ?? 0;
  const unusedLabels = traceability?.labelCounts?.Unused ?? 0;
  const queue = useMemo(() => [
    {
      title: 'Complete physical reconciliation',
      note: (reconciliation?.totals.pending ?? 0) + ' pending · ' + (reconciliation?.totals.exceptions ?? 0) + ' exception row(s)',
      href: '/inventory/reconciliation',
      ready: (reconciliation?.totals.pending ?? 0) === 0 && (reconciliation?.totals.exceptions ?? 0) === 0,
    },
    {
      title: 'Resolve traceability exceptions',
      note: (traceability?.openBlocking ?? 0) + ' blocking · ' + unusedLabels + ' unused label(s)',
      href: '/inventory/traceability',
      ready: (traceability?.openBlocking ?? 0) === 0,
    },
    {
      title: 'Inventory validation',
      note: blockers > 0 ? 'Blocked until all blocking exceptions are cleared' : 'Ready for Inventory-person validation',
      href: '/inventory/reconciliation/validation',
      ready: blockers === 0,
    },
  ], [blockers, reconciliation, traceability, unusedLabels]);

  return (
    <main className="workflow-page role-workspace">
      <header className="role-hero role-hero-inventory">
        <div>
          <Link className="back-link role-back" href="/roles">← Role Workspaces</Link>
          <p className="eyebrow">Inventory Person</p>
          <h1>Store Operations</h1>
          <p className="lead">Receive, identify, locate, count and reconcile physical inventory. This workspace deliberately excludes Admin approval controls.</p>
        </div>
        <div className="role-identity-card">
          <span>Role</span><strong>Inventory</strong><small>Operational write access · no Admin approval</small>
        </div>
      </header>

      <section className="role-kpi-grid">
        <article className="role-kpi"><span>Ready Rows</span><strong>{reconciliation?.totals.ready ?? '—'}</strong><small>Reconciled and ready</small></article>
        <article className="role-kpi"><span>Pending Rows</span><strong>{reconciliation?.totals.pending ?? '—'}</strong><small>Physical work still pending</small></article>
        <article className="role-kpi"><span>Blocking Exceptions</span><strong>{blockers || 0}</strong><small>Count + traceability blockers</small></article>
        <article className="role-kpi role-kpi-gate"><span>Opening Stock Gate</span><strong>{reconciliation?.openingStockGate ?? 'BLOCKED'}</strong><small>Posting remains a separate control</small></article>
      </section>

      <section className="panel role-primary-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Daily Work</p><h2>Store actions</h2></div>
          <Link className="status" href="/inventory">Search Item Master</Link>
        </div>
        <div className="role-action-grid">
          {primary.map(([label, href, note], index) => (
            <Link className={index === 0 ? 'role-action role-action-primary' : 'role-action'} href={href} key={label}>
              <strong>{label}</strong><span>{note}</span><b>→</b>
            </Link>
          ))}
        </div>
      </section>

      <div className="role-two-column">
        <section className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Daily Queue</p><h2>What needs attention</h2></div>
            <span className="status">Live from FacilityOS controls</span>
          </div>
          <div className="role-task-list">
            {queue.map((task, index) => (
              <Link href={task.href} key={task.title}>
                <span className={task.ready ? 'role-task-priority role-task-ready' : 'role-task-priority'}>{task.ready ? '✓' : index + 1}</span>
                <div><strong>{task.title}</strong><small>{task.note}</small></div><b>→</b>
              </Link>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Traceability</p><h2>Identity controls</h2></div>
            <span className={blockers ? 'preview-badge' : 'preview-badge live-badge'}>{blockers ? 'Needs attention' : 'Clear'}</span>
          </div>
          <dl className="result-fields">
            <div><dt>Unused labels</dt><dd>{unusedLabels}</dd></div>
            <div><dt>Open traceability exceptions</dt><dd>{traceability?.exceptions?.length ?? '—'}</dd></div>
            <div><dt>Blocking traceability</dt><dd>{traceability?.openBlocking ?? '—'}</dd></div>
            <div><dt>Validation status</dt><dd>{reconciliation?.validationStatus ?? 'Not started'}</dd></div>
          </dl>
          <div className="role-mini-grid" style={{ marginTop: 14 }}>
            <Link href="/inventory/traceability"><strong>Labels & Exceptions</strong><span>Unused, void, missing sticker and identity gaps</span></Link>
            <Link href="/inventory/reconciliation"><strong>Reconciliation</strong><span>Reference, physical, attached/WIP, difference</span></Link>
          </div>
        </section>
      </div>

      <section className="role-rule-strip">
        <strong>Inventory rule:</strong> record what physically exists. Do not invent serials, infer missing stock from serial gaps, or post ERPNext stock until reconciliation and approvals are complete.
      </section>
    </main>
  );
}
