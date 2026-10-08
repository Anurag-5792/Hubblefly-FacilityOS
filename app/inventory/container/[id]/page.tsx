'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { FacilityContainerResponse } from '../../../../lib/facility/types';

export default function ContainerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = useMemo(() => decodeURIComponent(params.id ?? '').toUpperCase(), [params.id]);
  const [data, setData] = useState<FacilityContainerResponse | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let active = true;
    setBusy(true);
    fetch(`/api/facility/container?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload: FacilityContainerResponse) => { if (active) setData(payload); })
      .catch(() => { if (active) setData({ ok: false, source: 'sample', error: 'Container could not be loaded.' }); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [id]);

  const container = data?.container;
  const totalQty = (container?.contents ?? []).reduce((sum, line) => sum + Number(line.quantity || 0), 0);

  return (
    <main className="workflow-page">
      <header className="scan-header">
        <div>
          <Link className="back-link" href="/inventory">← Inventory</Link>
          <p className="eyebrow">FacilityOS · Container</p>
          <h1>{id}</h1>
          <p className="lead">Container identity, current placement, contents and movement history.</p>
        </div>
        <span className={data?.source === 'facilityos' ? 'preview-badge live-badge' : 'preview-badge'}>
          {data?.source === 'facilityos' ? 'FacilityOS live' : 'Sample mode'}
        </span>
      </header>

      {busy && <section className="panel">Loading container…</section>}
      {!busy && data?.error && <section className="panel workflow-result error">{data.error}</section>}

      {!busy && container && (
        <>
          <section className="stats-grid">
            <article className="stat-card"><span>Total quantity</span><strong>{totalQty}</strong></article>
            <article className="stat-card"><span>Content lines</span><strong>{container.contents.length}</strong></article>
            <article className="stat-card"><span>Location</span><strong style={{fontSize: 16}}>{container.currentPosition ?? 'Unplaced'}</strong></article>
            <article className="stat-card"><span>Status</span><strong>{container.status.toUpperCase()}</strong></article>
          </section>

          {data?.note && <div className="preview-note">{data.note}</div>}

          <section className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-heading">
              <div><p className="eyebrow">Container master</p><h2>{container.label}</h2></div>
              <span className="status">{container.kind}</span>
            </div>
            <dl className="result-fields">
              <div><dt>Container ID</dt><dd>{container.id}</dd></div>
              <div><dt>Current Position</dt><dd>{container.currentPosition ?? 'Not placed'}</dd></div>
              <div><dt>Capacity</dt><dd>{container.capacity ?? 'Not fixed'}</dd></div>
              <div><dt>Status</dt><dd>{container.status}</dd></div>
            </dl>
          </section>

          <section className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-heading">
              <div><p className="eyebrow">Contents</p><h2>Current stock in container</h2></div>
              <span className="status">{totalQty} total qty</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Item</th><th>Name</th><th>Qty</th><th>Batch / Serial</th><th>Condition</th></tr></thead>
                <tbody>
                  {container.contents.length === 0 ? (
                    <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>Container is empty or has not been reconciled yet.</td></tr>
                  ) : container.contents.map((line, index) => (
                    <tr key={`${line.itemCode}-${index}`}>
                      <td><strong>{line.itemCode}</strong></td>
                      <td>{line.itemName ?? '—'}</td>
                      <td>{line.quantity}</td>
                      <td>{line.batchNo ?? line.serialNos?.join(', ') ?? '—'}</td>
                      <td>{line.condition ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Audit</p><h2>Movement & count history</h2></div>
              <span className="status">FacilityOS</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Time</th><th>Event</th><th>From</th><th>To</th><th>Reference</th><th>Operator</th></tr></thead>
                <tbody>
                  {container.history.length === 0 ? (
                    <tr><td colSpan={6} style={{ color: 'var(--muted)' }}>No FacilityOS history recorded yet.</td></tr>
                  ) : container.history.map((event, index) => (
                    <tr key={`${event.occurredAt}-${index}`}>
                      <td>{event.occurredAt}</td>
                      <td><strong>{event.event}</strong></td>
                      <td>{event.from ?? '—'}</td>
                      <td>{event.to ?? '—'}</td>
                      <td>{event.reference ?? '—'}</td>
                      <td>{event.performedBy ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="workflow-actions" style={{ marginTop: 16 }}>
            <Link className="action action-featured action-link" href={`/inventory/move?source=${encodeURIComponent(id)}`}>Move Container</Link>
            <Link className="action action-link" href={`/inventory/count?target=${encodeURIComponent(id)}`}>Physical Count</Link>
            {container.currentPosition && <Link className="action action-link" href={`/inventory/position/${encodeURIComponent(container.currentPosition)}`}>Open Position</Link>}
          </section>
        </>
      )}
    </main>
  );
}
