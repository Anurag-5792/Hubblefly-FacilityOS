'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { FacilityPositionResponse } from '../../../../lib/facility/types';

export default function PositionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = useMemo(() => decodeURIComponent(params.id ?? '').toUpperCase(), [params.id]);
  const [data, setData] = useState<FacilityPositionResponse | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let active = true;
    setBusy(true);
    fetch(`/api/facility/position?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload: FacilityPositionResponse) => { if (active) setData(payload); })
      .catch(() => { if (active) setData({ ok: false, source: 'sample', error: 'Position could not be loaded.' }); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [id]);

  const position = data?.position;
  const containerCount = position?.containers.length ?? 0;
  const looseQty = (position?.looseContents ?? []).reduce((sum, line) => sum + Number(line.quantity || 0), 0);

  return (
    <main className="workflow-page">
      <header className="scan-header">
        <div>
          <Link className="back-link" href="/inventory">← Inventory</Link>
          <p className="eyebrow">FacilityOS · Physical location</p>
          <h1>{id}</h1>
          <p className="lead">Current position contents, stack-slot context and container placement. ERPNext remains authoritative for stock transactions.</p>
        </div>
        <span className={data?.source === 'facilityos' ? 'preview-badge live-badge' : 'preview-badge'}>
          {data?.source === 'facilityos' ? 'FacilityOS live' : 'Sample mode'}
        </span>
      </header>

      {busy && <section className="panel">Loading position…</section>}
      {!busy && data?.error && <section className="panel workflow-result error">{data.error}</section>}

      {!busy && position && (
        <>
          <section className="stats-grid">
            <article className="stat-card"><span>Containers</span><strong>{containerCount}</strong></article>
            <article className="stat-card"><span>Loose quantity</span><strong>{looseQty}</strong></article>
            <article className="stat-card"><span>Stack slot</span><strong>{position.stackSlot ?? 'Base'}</strong></article>
            <article className="stat-card"><span>Status</span><strong>{position.status === 'active' ? 'Active' : 'Blocked'}</strong></article>
          </section>

          {data?.note && <div className="preview-note">{data.note}</div>}

          <section className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-heading">
              <div><p className="eyebrow">Position master</p><h2>Location</h2></div>
            </div>
            <dl className="result-fields">
              <div><dt>Rack</dt><dd>{position.rack}</dd></div>
              <div><dt>Level</dt><dd>{position.level}</dd></div>
              <div><dt>Position</dt><dd>{position.position}</dd></div>
              <div><dt>Stack Slot</dt><dd>{position.stackSlot ?? 'Not specified'}</dd></div>
            </dl>
          </section>

          <section className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-heading">
              <div><p className="eyebrow">Placed containers</p><h2>Container contents</h2></div>
              <span className="status">{containerCount} container(s)</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Container</th><th>Type</th><th>Lines</th><th>Quantity</th><th>Action</th></tr></thead>
                <tbody>
                  {position.containers.length === 0 ? (
                    <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>No container is currently placed here.</td></tr>
                  ) : position.containers.map((container) => {
                    const qty = container.contents.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
                    return (
                      <tr key={container.id}>
                        <td><strong>{container.id}</strong></td>
                        <td>{container.label}</td>
                        <td>{container.contents.length}</td>
                        <td>{qty}</td>
                        <td><Link className="mis-link" href={`/inventory/container/${encodeURIComponent(container.id)}`}>Open →</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Loose stock</p><h2>Directly at this position</h2></div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Item</th><th>Name</th><th>Qty</th><th>Batch / Serial</th><th>Condition</th></tr></thead>
                <tbody>
                  {position.looseContents.length === 0 ? (
                    <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>No loose stock recorded.</td></tr>
                  ) : position.looseContents.map((line, index) => (
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

          <section className="workflow-actions" style={{ marginTop: 16 }}>
            <Link className="action action-featured action-link" href={`/inventory/move?destination=${encodeURIComponent(id)}`}>Move Stock Here</Link>
            <Link className="action action-link" href={`/inventory/count?target=${encodeURIComponent(id)}`}>Physical Count</Link>
            <Link className="action action-link" href={`/inventory/scan?value=${encodeURIComponent(id)}`}>Scan / Resolve</Link>
          </section>
        </>
      )}
    </main>
  );
}
