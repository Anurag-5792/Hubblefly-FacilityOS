'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Health = {
  ok: boolean;
  service: string;
  erpnext: {
    configured: boolean;
    reachable: boolean;
    authenticated: boolean;
  };
  facilityos: {
    backend: {
      installed: boolean;
      ready: boolean;
      version: string | null;
      missingDoctypes: string[];
    };
    misSource: 'sample' | 'frappe';
    operationsSource: 'sample' | 'frappe';
    writePostingEnabled: boolean;
    openingStockPostingEnabled: boolean;
  };
};

export default function IntegrationsPage() {
  const [data, setData] = useState<Health | null>(null);
  const [error, setError] = useState('');

  async function refresh() {
    setError('');
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const payload = await response.json() as Health;
      setData(payload);
    } catch {
      setError('Integration health could not be loaded.');
    }
  }

  useEffect(() => { void refresh(); }, []);

  const erpState = !data?.erpnext.configured
    ? 'Not configured'
    : data.erpnext.authenticated
      ? 'Connected'
      : 'Connection failed';

  return (
    <main className="workflow-page">
      <header className="scan-header">
        <div>
          <Link className="back-link" href="/">← Dashboard</Link>
          <p className="eyebrow">Admin · Integrations</p>
          <h1>Connection Health</h1>
          <p className="lead">Verify FacilityOS server configuration without exposing API keys or secrets to the browser.</p>
        </div>
        <button className="scan-primary" type="button" onClick={() => void refresh()}>Refresh</button>
      </header>

      {error && <div className="lookup-warning">{error}</div>}

      <section className="stats-grid">
        <article className="stat-card"><span>ERPNext</span><strong style={{fontSize: 18}}>{erpState}</strong></article>
        <article className="stat-card"><span>FacilityOS Backend</span><strong style={{fontSize: 18}}>{data?.facilityos.backend.ready ? 'Ready' : data?.facilityos.backend.installed ? 'Incomplete' : 'Not installed'}</strong></article>
        <article className="stat-card"><span>Operations source</span><strong style={{fontSize: 18}}>{data?.facilityos.operationsSource ?? '—'}</strong></article>
        <article className="stat-card"><span>ERP writes</span><strong style={{fontSize: 18}}>{data?.facilityos.writePostingEnabled ? 'Enabled' : 'Disabled'}</strong></article>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-heading">
          <div><p className="eyebrow">ERPNext / Frappe</p><h2>Server connection</h2></div>
          <span className={data?.erpnext.authenticated ? 'preview-badge live-badge' : 'preview-badge'}>{erpState}</span>
        </div>
        <dl className="result-fields">
          <div><dt>Configured</dt><dd>{data?.erpnext.configured ? 'Yes' : 'No'}</dd></div>
          <div><dt>Reachable</dt><dd>{data?.erpnext.reachable ? 'Yes' : 'No'}</dd></div>
          <div><dt>Authenticated</dt><dd>{data?.erpnext.authenticated ? 'Yes' : 'No'}</dd></div>
          <div><dt>Credentials in browser</dt><dd>No</dd></div>
        </dl>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-heading">
          <div><p className="eyebrow">FacilityOS Frappe App</p><h2>Backend readiness</h2></div>
          <span className={data?.facilityos.backend.ready ? 'preview-badge live-badge' : 'preview-badge'}>
            {data?.facilityos.backend.ready ? 'Ready' : 'Pending install / migrate'}
          </span>
        </div>
        <dl className="result-fields">
          <div><dt>Installed</dt><dd>{data?.facilityos.backend.installed ? 'Yes' : 'No'}</dd></div>
          <div><dt>Ready</dt><dd>{data?.facilityos.backend.ready ? 'Yes' : 'No'}</dd></div>
          <div><dt>Version</dt><dd>{data?.facilityos.backend.version ?? '—'}</dd></div>
          <div><dt>Missing DocTypes</dt><dd>{data?.facilityos.backend.missingDoctypes?.length ? data.facilityos.backend.missingDoctypes.join(', ') : 'None reported'}</dd></div>
        </dl>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-heading">
          <div><p className="eyebrow">Safety gates</p><h2>Production writes</h2></div>
          <span className="status">Read-only integration phase</span>
        </div>
        <dl className="result-fields">
          <div><dt>Stock posting</dt><dd>{data?.facilityos.writePostingEnabled ? 'Enabled' : 'Disabled'}</dd></div>
          <div><dt>Opening stock posting</dt><dd>{data?.facilityos.openingStockPostingEnabled ? 'Enabled' : 'Blocked'}</dd></div>
          <div><dt>Transaction previews</dt><dd>Enabled</dd></div>
          <div><dt>Physical count</dt><dd>FacilityOS preview / reconciliation</dd></div>
        </dl>
      </section>

      <section className="workflow-actions">
        <Link className="action action-featured action-link" href="/admin/sync">Open Sync Status</Link>
        <Link className="action action-link" href="/inventory/reconciliation">Open Reconciliation</Link>
      </section>

      <section className="scan-note">
        <strong>Security rule:</strong> this page only receives booleans and source-state information. ERPNext API key and secret stay on the server and are never returned to the browser.
      </section>
    </main>
  );
}
