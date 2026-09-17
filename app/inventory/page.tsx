'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';

type ItemRow = {
  name: string;
  item_name?: string;
  item_group?: string;
  stock_uom?: string;
  brand?: string;
  has_serial_no?: number;
  has_batch_no?: number;
};

type SearchResponse = {
  source: 'erpnext' | 'preview';
  results: ItemRow[];
  error?: string;
};

const actions = [
  ['Scan QR', '/inventory/scan'],
  ['Receive', '/inventory/transaction?kind=receive'],
  ['Move', '/inventory/move'],
  ['Issue', '/inventory/transaction?kind=issue'],
  ['Return', '/inventory/transaction?kind=return'],
  ['Physical Count', '/inventory/count'],
];

export default function InventoryHomePage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ItemRow[]>([]);
  const [source, setSource] = useState<'erpnext' | 'preview'>('preview');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function search(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/inventory/search?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
      const data = await response.json() as SearchResponse;
      setResults(data.results ?? []);
      setSource(data.source ?? 'preview');
      setError(data.error ?? '');
    } catch {
      setResults([]);
      setError('Search could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workflow-page">
      <header className="scan-header">
        <div>
          <Link className="back-link" href="/">← Dashboard</Link>
          <p className="eyebrow">HFT Store · Inventory</p>
          <h1>Inventory Control</h1>
          <p className="lead">Search, scan and act from one place. ERPNext remains the stock system of record; FacilityOS adds fast operator workflows and physical-location context.</p>
        </div>
        <Link className="scan-primary scan-link" href="/inventory/scan">▣ Scan QR</Link>
      </header>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-heading">
          <div><p className="eyebrow">Quick actions</p><h2>Store operations</h2></div>
          <span className="status">HFT Store</span>
        </div>
        <div className="action-grid">
          {actions.map(([label, href], index) => (
            <Link key={label} href={href} className={index === 0 ? 'action action-featured action-link' : 'action action-link'}>{label}</Link>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Search</p><h2>Item Master</h2></div>
          <span className={source === 'erpnext' ? 'preview-badge live-badge' : 'preview-badge'}>{source === 'erpnext' ? 'Live ERPNext' : 'Preview data'}</span>
        </div>

        <form onSubmit={search} className="scan-form">
          <label htmlFor="inventory-search">Item code, name or category</label>
          <div className="scan-input-row">
            <input id="inventory-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. PWR-BAT-01, battery, motor" />
            <button className="scan-primary" type="submit" disabled={busy || !query.trim()}>{busy ? 'Searching…' : 'Search'}</button>
          </div>
        </form>

        {error && <div className="lookup-warning" style={{ marginTop: 16 }}>{error}</div>}

        <div style={{ marginTop: 18, overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Item Code</th><th>Item Name</th><th>Group</th><th>Control</th><th>UOM</th><th>Action</th></tr></thead>
            <tbody>
              {results.length === 0 ? (
                <tr><td colSpan={6} style={{ color: 'var(--muted)' }}>Search the Item Master to begin.</td></tr>
              ) : results.map((item) => (
                <tr key={item.name}>
                  <td><strong>{item.name}</strong></td>
                  <td>{item.item_name || '—'}</td>
                  <td>{item.item_group || '—'}</td>
                  <td>{item.has_serial_no ? 'Serial' : item.has_batch_no ? 'Batch' : 'Standard'}</td>
                  <td>{item.stock_uom || '—'}</td>
                  <td><Link className="mis-link" href={`/inventory/scan?value=${encodeURIComponent(item.name)}`}>Open →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
