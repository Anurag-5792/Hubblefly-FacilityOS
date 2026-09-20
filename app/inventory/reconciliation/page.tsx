'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { ReconciliationRow, ReconciliationSummary } from '../../../lib/reconciliation/types';

type Filter = 'all' | 'counted' | 'pending' | 'exception' | 'ready';

export default function ReconciliationPage() {
  const [data, setData] = useState<ReconciliationSummary | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let active = true;
    setBusy(true);
    fetch('/api/inventory/reconciliation', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload: ReconciliationSummary) => { if (active) setData(payload); })
      .catch(() => {
        if (active) {
          setData({
            ok: false,
            source: 'sample',
            rows: [],
            totals: { counted: 0, pending: 0, exceptions: 0, ready: 0 },
            openingStockGate: 'BLOCKED',
            error: 'Reconciliation data could not be loaded.',
          });
        }
      })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    if (filter === 'all') return data.rows;
    return data.rows.filter((row) => row.status === filter);
  }, [data, filter]);

  function statusLabel(row: ReconciliationRow) {
    if (row.status === 'ready') return 'Ready';
    if (row.status === 'counted') return 'Counted';
    if (row.status === 'pending') return 'Pending';
    return 'Exception';
  }

  return (
    <main className="workflow-page">
      <header className="scan-header">
        <div>
          <Link className="back-link" href="/inventory">← Inventory</Link>
          <p className="eyebrow">Physical truth · Reconciliation</p>
          <h1>Inventory Reconciliation</h1>
          <p className="lead">Compare reference quantities with verified physical stock, attached/WIP quantities and unresolved exceptions before opening-stock approval.</p>
        </div>
        <span className={data?.source === 'facilityos' ? 'preview-badge live-badge' : 'preview-badge'}>
          {data?.source === 'facilityos' ? 'FacilityOS live' : 'Sample mode'}
        </span>
      </header>

      {busy && <section className="panel">Loading reconciliation…</section>}
      {!busy && data?.error && <div className="lookup-warning">{data.error}</div>}

      {!busy && data && (
        <>
          <section className="stats-grid">
            <article className="stat-card"><span>Ready</span><strong>{data.totals.ready}</strong></article>
            <article className="stat-card"><span>Counted</span><strong>{data.totals.counted}</strong></article>
            <article className="stat-card"><span>Pending</span><strong>{data.totals.pending}</strong></article>
            <article className="stat-card"><span>Exceptions</span><strong>{data.totals.exceptions}</strong></article>
          </section>

          <section className={data.openingStockGate === 'BLOCKED' ? 'lookup-warning' : 'preview-note'} style={{ marginBottom: 16 }}>
            <strong>Opening Stock Gate: {data.openingStockGate}</strong>
            <div style={{ marginTop: 6 }}>
              Physical count and reconciliation must be complete before any opening-stock posting is approved.
            </div>
          </section>

          {data.note && <div className="preview-note">{data.note}</div>}

          <section className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-heading">
              <div><p className="eyebrow">Review queue</p><h2>Reconciliation status</h2></div>
              <span className="status">{rows.length} row(s)</span>
            </div>

            <div className="sample-chips" style={{ marginBottom: 16 }}>
              {(['all', 'ready', 'counted', 'pending', 'exception'] as Filter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  style={{ fontWeight: filter === value ? 900 : 600 }}
                >
                  {value === 'all' ? 'All' : value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Control</th>
                    <th>Reference</th>
                    <th>Physical</th>
                    <th>Attached/WIP</th>
                    <th>Accounted</th>
                    <th>Difference</th>
                    <th>Location</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={9} style={{ color: 'var(--muted)' }}>No rows match this filter.</td></tr>
                  ) : rows.map((row) => (
                    <tr key={row.itemCode}>
                      <td>
                        <strong>{row.itemCode}</strong>
                        <br/>
                        <small>{row.itemName ?? '—'}</small>
                        {row.exception && <div style={{ marginTop: 6, color: '#8a5a00' }}>{row.exception}</div>}
                      </td>
                      <td>{row.control}</td>
                      <td>{row.referenceQty ?? '—'}</td>
                      <td>{row.physicalQty ?? '—'}</td>
                      <td>{row.attachedQty ?? '—'}</td>
                      <td>{row.accountedQty ?? '—'}</td>
                      <td>{row.difference ?? '—'}</td>
                      <td>{row.container ?? row.location ?? '—'}</td>
                      <td><strong>{statusLabel(row)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="workflow-actions">
            <Link className="action action-featured action-link" href="/inventory/count">Continue Physical Count</Link>
            <Link className="action action-link" href="/inventory/scan">Scan Stock</Link>
            <Link className="action action-link" href="/admin/sync">Sync Status</Link>
          </section>
        </>
      )}
    </main>
  );
}
