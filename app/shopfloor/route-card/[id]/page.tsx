'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { RouteCardResponse } from '../../../../lib/shopfloor/types';

export default function RouteCardPage() {
  const params = useParams<{ id: string }>();
  const id = useMemo(() => decodeURIComponent(params.id ?? ''), [params.id]);
  const [data, setData] = useState<RouteCardResponse | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let active = true;
    setBusy(true);
    fetch('/api/shopfloor/route-card?id=' + encodeURIComponent(id), { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload: RouteCardResponse) => { if (active) setData(payload); })
      .catch(() => { if (active) setData({ ok: false, source: 'sample', error: 'Route card could not be loaded.' }); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [id]);

  const card = data?.routeCard;
  const complete = card?.operations.filter((operation) => operation.status === 'complete').length ?? 0;
  const total = card?.operations.length ?? 0;
  const progress = total ? Math.round((complete / total) * 100) : 0;

  return (
    <main className="workflow-page role-workspace">
      <header className="role-hero role-hero-shopfloor">
        <div>
          <Link className="back-link role-back" href="/shopfloor">← Shopfloor</Link>
          <p className="eyebrow">Route Card</p>
          <h1>{card?.serialNo ?? id}</h1>
          <p className="lead">Scan-driven assembly progress, expected component identity and immutable genealogy events.</p>
        </div>
        <div className="role-identity-card">
          <span>Status</span>
          <strong>{card?.status?.replace('_', ' ').toUpperCase() ?? '—'}</strong>
          <small>{card?.sfgCode ?? 'SFG'} · {progress}% complete</small>
        </div>
      </header>

      {busy && <section className="panel">Loading route card…</section>}
      {!busy && data?.error && <section className="panel workflow-result error">{data.error}</section>}

      {!busy && card && (
        <>
          <section className="role-kpi-grid">
            <article className="role-kpi"><span>Operations</span><strong>{complete}/{total}</strong><small>Completed route stages</small></article>
            <article className="role-kpi"><span>Current Operation</span><strong>#{card.currentOperation}</strong><small>Next accountable production step</small></article>
            <article className="role-kpi"><span>Genealogy Events</span><strong>{card.genealogy.length}</strong><small>Build/install/remove/replace history</small></article>
            <article className="role-kpi"><span>ERP Stock Posting</span><strong>Not here</strong><small>Shopfloor does not post ERP stock</small></article>
          </section>

          {data?.note && <div className="preview-note">{data.note}</div>}

          <section className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-heading">
              <div><p className="eyebrow">Build Progress</p><h2>Route operations</h2></div>
              <span className="status">{progress}% complete</span>
            </div>
            <div className="route-operation-list">
              {card.operations.map((operation) => (
                <article className={operation.status === 'complete' ? 'route-operation route-operation-complete' : operation.status === 'in_progress' ? 'route-operation route-operation-active' : 'route-operation'} key={operation.sequence}>
                  <span className="route-operation-sequence">{operation.sequence}</span>
                  <div>
                    <strong>{operation.operation}</strong>
                    {operation.expectedComponent && <small>Expected: {operation.expectedComponent}</small>}
                    {operation.scannedComponent && <small>Scanned: {operation.scannedComponent}</small>}
                    {operation.operator && <small>{operation.operator}{operation.completedAt ? ' · ' + operation.completedAt : ''}</small>}
                  </div>
                  <span className="status">{operation.status.replace('_', ' ')}</span>
                </article>
              ))}
            </div>
          </section>

          <div className="role-two-column">
            <section className="panel">
              <div className="panel-heading"><div><p className="eyebrow">Current Job</p><h2>Scan & record</h2></div></div>
              <div className="role-action-grid">
                <Link className="role-action role-action-primary" href="/inventory/scan"><strong>Scan Component</strong><span>Resolve component identity before installation</span><b>→</b></Link>
                <Link className="role-action" href="/inventory/traceability"><strong>Report Identity Issue</strong><span>Missing label / mismatch / unrecognized identity</span><b>→</b></Link>
                <a className="role-action" href="#genealogy"><strong>View Genealogy</strong><span>Review component-to-SFG history</span><b>↓</b></a>
              </div>
            </section>

            <section className="panel" id="genealogy">
              <div className="panel-heading"><div><p className="eyebrow">Genealogy</p><h2>Assembly history</h2></div><span className="status">{card.genealogy.length} event(s)</span></div>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>Event</th><th>Child</th><th>Parent</th><th>Operator</th><th>Time</th></tr></thead>
                  <tbody>
                    {card.genealogy.length === 0 ? (
                      <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>No genealogy events recorded yet.</td></tr>
                    ) : card.genealogy.map((event, index) => (
                      <tr key={event.event + '-' + event.childId + '-' + index}>
                        <td><strong>{event.event}</strong></td>
                        <td>{event.childId}</td>
                        <td>{event.parentId}</td>
                        <td>{event.operator ?? '—'}</td>
                        <td>{event.occurredAt ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="role-rule-strip">
            <strong>Shopfloor control:</strong> component identity must be resolved before genealogy is recorded. A missing sticker creates a traceability exception; it is never replaced with an invented serial.
          </section>
        </>
      )}
    </main>
  );
}
