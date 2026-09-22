'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import type { GenealogyExplorerResponse } from '../../../lib/shopfloor/genealogy-types';

export default function GenealogyExplorerPage() {
  const [entity, setEntity] = useState('SFG-ARM-01-S0017');
  const [depth, setDepth] = useState(3);
  const [data, setData] = useState<GenealogyExplorerResponse | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    try {
      const response = await fetch('/api/shopfloor/genealogy?entity=' + encodeURIComponent(entity) + '&depth=' + depth, { cache: 'no-store' });
      const payload = await response.json() as GenealogyExplorerResponse;
      setData(payload);
    } catch {
      setData({ ok: false, source: 'preview', root: entity, depth, nodes: [], events: [], error: 'Genealogy could not be loaded.' });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void run(); }, []);

  return (
    <main className="workflow-page role-workspace">
      <header className="role-hero role-hero-shopfloor">
        <div>
          <Link className="back-link role-back" href="/shopfloor">← Shopfloor</Link>
          <p className="eyebrow">Genealogy Explorer</p>
          <h1>Forward & Reverse Traceability</h1>
          <p className="lead">Start from any component, SFG or drone identity and inspect where it came from and where it was installed.</p>
        </div>
        <div className="role-identity-card">
          <span>Mode</span><strong>Read / Trace</strong><small>No genealogy mutation on this screen</small>
        </div>
      </header>

      <section className="panel" style={{ marginBottom: 16 }}>
        <form className="scan-form" onSubmit={run}>
          <label htmlFor="entity">Component / SFG / Drone ID</label>
          <div className="scan-input-row">
            <input id="entity" value={entity} onChange={(event) => setEntity(event.target.value.toUpperCase())} placeholder="SFG-ARM-01-S0017" />
            <select value={depth} onChange={(event) => setDepth(Number(event.target.value))}>
              <option value={1}>1 level</option>
              <option value={2}>2 levels</option>
              <option value={3}>3 levels</option>
              <option value={4}>4 levels</option>
              <option value={5}>5 levels</option>
            </select>
            <button className="scan-primary" type="submit" disabled={busy}>{busy ? 'Tracing…' : 'Trace'}</button>
          </div>
        </form>
      </section>

      {data?.error && <section className="panel workflow-result error">{data.error}</section>}

      {data?.ok && (
        <>
          <section className="role-kpi-grid">
            <article className="role-kpi"><span>Root</span><strong style={{ fontSize: 15 }}>{data.root}</strong><small>Starting identity</small></article>
            <article className="role-kpi"><span>Related IDs</span><strong>{data.nodes.length}</strong><small>Within selected depth</small></article>
            <article className="role-kpi"><span>Events</span><strong>{data.events.length}</strong><small>Immutable genealogy links</small></article>
            <article className="role-kpi"><span>Depth</span><strong>{data.depth}</strong><small>{data.truncated ? 'Result capped at 200 events' : 'Search depth'}</small></article>
          </section>

          <div className="role-two-column">
            <section className="panel">
              <div className="panel-heading"><div><p className="eyebrow">Identity Map</p><h2>Related entities</h2></div></div>
              <div className="genealogy-node-grid">
                {data.nodes.map((node) => (
                  <button key={node} type="button" className={node === data.root ? 'genealogy-node genealogy-node-root' : 'genealogy-node'} onClick={() => setEntity(node)}>
                    {node}
                  </button>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading"><div><p className="eyebrow">History</p><h2>Genealogy events</h2></div><span className="status">{data.events.length} event(s)</span></div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>Event</th><th>Child</th><th>Parent</th><th>Route Card</th><th>Time</th></tr></thead>
                  <tbody>
                    {data.events.length === 0 ? (
                      <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>No genealogy history found.</td></tr>
                    ) : data.events.map((event) => (
                      <tr key={event.id}>
                        <td><strong>{event.event}</strong></td>
                        <td>{event.childId}</td>
                        <td>{event.parentId}</td>
                        <td>{event.routeCard ?? '—'}</td>
                        <td>{event.occurredAt ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="role-rule-strip">
            <strong>Traceability rule:</strong> genealogy events are append-only evidence. Removal or replacement creates a new event; it never rewrites the historical installation record.
          </section>
        </>
      )}
    </main>
  );
}
