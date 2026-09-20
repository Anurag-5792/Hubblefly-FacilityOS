'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SyncStatusResponse } from '../../../lib/sync/types';

export default function SyncAdminPage() {
  const [data, setData] = useState<SyncStatusResponse | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);

  async function loadStatus() {
    setError('');
    try {
      const response = await fetch('/api/sync/status', { cache: 'no-store' });
      const payload = await response.json() as SyncStatusResponse;
      setData(payload);
      if (!payload.ok) setError(payload.error ?? 'Sync status could not be loaded.');
    } catch {
      setError('Sync status could not be loaded.');
    }
  }

  async function runSync() {
    setRunning(true);
    setError('');
    try {
      const response = await fetch('/api/sync/run', { method: 'POST' });
      const payload = await response.json() as SyncStatusResponse;
      setData(payload);
      if (!payload.ok) setError(payload.error ?? 'Sync could not be run.');
    } catch {
      setError('Sync could not be run.');
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    void loadStatus();
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
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="scan-primary" type="button" disabled={running || data?.source !== 'facilityos-read-model'} onClick={() => void runSync()}>
            {running ? 'Syncing…' : 'Run Sync Now'}
          </button>
          <Link className="mis-link" href="/admin/integrations">Connection Health →</Link>
          <span className="preview-badge">{data?.source === 'facilityos-read-model' ? 'Frappe read model' : 'Sample mode'}</span>
        </div>
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
        <strong>Production rule:</strong> ERPNext stays authoritative for stock/accounting. FacilityOS stores synchronized read models for reporting and its own operational data in the existing Frappe site database. Manual sync only refreshes read models; it never posts ERP stock transactions.
      </section>
    </main>
  );
}
