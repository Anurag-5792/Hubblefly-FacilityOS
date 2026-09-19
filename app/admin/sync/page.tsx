'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SyncStatusResponse } from '../../../lib/sync/types';

export default function SyncAdminPage() {
  const [data, setData] = useState<SyncStatusResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/sync/status', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload: SyncStatusResponse) => setData(payload))
      .catch(() => setError('Sync status could not be loaded.'));
  }, []);

  return (
    <main className="workflow-page">
      <header className="scan-header">
        <div>
          <Link className="back-link" href="/">← Dashboard</Link>
          <p className="eyebrow">Admin · Data layer</p>
          <h1>FacilityOS Sync</h1>
          <p className="lead">Monitor the local FacilityOS reporting projections that power MIS without repeatedly querying ERPNext APIs.</p>
        </div>
        <span className="preview-badge">{data?.source === 'facilityos-read-model' ? 'Frappe read model' : 'Sample mode'}</span>
      </header>

      {error && <div className="lookup-warning">{error}</div>}

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Read-model health</p><h2>Projection status</h2></div>
          <span className="status">No extra database service</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr><th>Projection</th><th>Status</th><th>Last Success</th><th>Lag</th><th>Rows Processed</th></tr>
            </thead>
            <tbody>
              {!data ? (
                <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>Loading sync state…</td></tr>
              ) : data.projections.map((row) => (
                <tr key={row.projection}>
                  <td><strong>{row.projection}</strong></td>
                  <td>{row.status.toUpperCase()}</td>
                  <td>{row.lastSuccessAt ?? '—'}</td>
                  <td>{row.lagSeconds == null ? '—' : `${row.lagSeconds}s`}</td>
                  <td>{row.rowsProcessed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="scan-note">
        <strong>Production rule:</strong> ERPNext stays authoritative for stock/accounting. FacilityOS stores synchronized read models for reporting and its own operational data in the existing Frappe site database.
      </section>
    </main>
  );
}
