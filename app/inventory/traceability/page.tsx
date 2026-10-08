'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { TraceabilityMutation, TraceabilitySummary } from '../../../lib/traceability/types';

type Mode = 'unused' | 'missing';

export default function TraceabilityPage() {
  const [data, setData] = useState<TraceabilitySummary | null>(null);
  const [mode, setMode] = useState<Mode>('unused');
  const [labels, setLabels] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [reference, setReference] = useState('');
  const [entityType, setEntityType] = useState('SFG');
  const [entityId, setEntityId] = useState('');
  const [expectedLabel, setExpectedLabel] = useState('');
  const [remarks, setRemarks] = useState('');
  const [resolutionRemarks, setResolutionRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TraceabilityMutation | null>(null);

  const load = useCallback(async () => {
    const response = await fetch('/api/inventory/traceability', { cache: 'no-store' });
    const payload = await response.json() as TraceabilitySummary;
    setData(payload);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totalLabels = useMemo(
    () => Object.values(data?.labelCounts ?? {}).reduce((sum, value) => sum + Number(value || 0), 0),
    [data],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const body = mode === 'unused'
        ? {
            action: 'mark_unused',
            labels: labels.split(/[\n,]+/).map((value) => value.trim()).filter(Boolean),
            itemCode: itemCode || undefined,
            reference: reference || undefined,
            remarks: remarks || undefined,
          }
        : {
            action: 'missing_sticker',
            entityType,
            entityId,
            itemCode: itemCode || undefined,
            expectedLabel: expectedLabel || undefined,
            remarks: remarks || undefined,
          };

      const response = await fetch('/api/inventory/traceability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as TraceabilityMutation;
      setResult(payload);
      if (payload.ok) {
        if (mode === 'unused') setLabels('');
        if (mode === 'missing') setEntityId('');
        setRemarks('');
        await load();
      }
    } catch {
      setResult({ ok: false, persisted: false, error: 'Traceability update failed.' });
    } finally {
      setBusy(false);
    }
  }

  async function resolve(exceptionId: string) {
    if (!resolutionRemarks.trim()) {
      setResult({ ok: false, persisted: false, error: 'Enter resolution remarks before resolving an exception.' });
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const response = await fetch('/api/inventory/traceability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve', exceptionId, remarks: resolutionRemarks }),
      });
      const payload = await response.json() as TraceabilityMutation;
      setResult(payload);
      if (payload.ok) {
        setResolutionRemarks('');
        await load();
      }
    } catch {
      setResult({ ok: false, persisted: false, error: 'Exception resolution failed.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workflow-page">
      <header className="scan-header">
        <div>
          <Link className="back-link" href="/inventory">← Inventory</Link>
          <p className="eyebrow">Inventory · Traceability Control</p>
          <h1>Labels & Exceptions</h1>
          <p className="lead">Keep prepared-but-unused serial labels out of physical stock and separately track missing stickers or identity gaps as blocking traceability exceptions.</p>
        </div>
        <span className={data?.source === 'facilityos' ? 'preview-badge live-badge' : 'preview-badge'}>
          {data?.source === 'facilityos' ? 'FacilityOS live' : 'Sample mode'}
        </span>
      </header>

      <section className="stats-grid">
        <article className="stat-card"><span>Known labels</span><strong>{totalLabels}</strong></article>
        <article className="stat-card"><span>Unused labels</span><strong>{data?.labelCounts?.Unused ?? 0}</strong></article>
        <article className="stat-card"><span>Open exceptions</span><strong>{data?.exceptions?.length ?? 0}</strong></article>
        <article className="stat-card"><span>Blocking</span><strong>{data?.openBlocking ?? 0}</strong></article>
      </section>

      {data?.error && <div className="lookup-warning" style={{ marginBottom: 16 }}>{data.error}</div>}

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-heading">
          <div><p className="eyebrow">Capture</p><h2>Traceability Update</h2></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className={mode === 'unused' ? 'primary-button' : 'action'} onClick={() => setMode('unused')}>Unused Labels</button>
            <button type="button" className={mode === 'missing' ? 'primary-button' : 'action'} onClick={() => setMode('missing')}>Missing Sticker</button>
          </div>
        </div>

        <form className="workflow-form" onSubmit={submit}>
          <div className="workflow-grid">
            {mode === 'unused' ? (
              <>
                <label>
                  <span>Unused Serial IDs</span>
                  <textarea
                    value={labels}
                    onChange={(event) => setLabels(event.target.value)}
                    placeholder={'One per line or comma-separated\nSAMPLE-MTR-01-S0001'}
                    rows={6}
                  />
                  <small>These IDs are label inventory only and are excluded from physical stock.</small>
                </label>
                <label><span>Item Code (optional)</span><input value={itemCode} onChange={(event) => setItemCode(event.target.value)} /></label>
                <label><span>Source Reference (optional)</span><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Sheet / print batch" /></label>
              </>
            ) : (
              <>
                <label><span>Entity Type</span><select value={entityType} onChange={(event) => setEntityType(event.target.value)}><option>SFG</option><option>Serial</option><option>Item</option><option>Container</option><option>Drone</option></select></label>
                <label><span>Entity ID</span><input value={entityId} onChange={(event) => setEntityId(event.target.value)} placeholder="SFG / serial / entity ID" required /></label>
                <label><span>Item Code (optional)</span><input value={itemCode} onChange={(event) => setItemCode(event.target.value)} /></label>
                <label><span>Expected Label (optional)</span><input value={expectedLabel} onChange={(event) => setExpectedLabel(event.target.value)} /></label>
              </>
            )}
            <label><span>Remarks</span><input value={remarks} onChange={(event) => setRemarks(event.target.value)} /></label>
          </div>

          <div className="workflow-actions">
            <button className="scan-primary" type="submit" disabled={busy}>
              {busy ? 'Saving…' : mode === 'unused' ? 'Mark as Unused' : 'Report Missing Sticker'}
            </button>
            <span>{mode === 'unused' ? 'Does not create stock.' : 'Creates a blocking exception until resolved.'}</span>
          </div>
        </form>
      </section>

      {result && (
        <section className={result.ok ? 'panel workflow-result success' : 'panel workflow-result error'} style={{ marginBottom: 16 }}>
          <p className="eyebrow">Update result</p>
          <h2>{result.ok ? 'Traceability updated' : 'Update failed'}</h2>
          {result.error && <div className="lookup-warning">{result.error}</div>}
          {result.ok && <dl className="result-fields"><div><dt>Persisted</dt><dd>{result.persisted ? 'Yes' : 'No — preview mode'}</dd></div><div><dt>Updated</dt><dd>{result.updated ?? (result.exceptionId ? 1 : '—')}</dd></div><div><dt>Status</dt><dd>{result.status ?? (result.created ? 'Open exception' : '—')}</dd></div></dl>}
          {result.note && <div className="preview-note" style={{ marginTop: 12 }}>{result.note}</div>}
        </section>
      )}

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Exception queue</p><h2>Open Traceability Exceptions</h2></div>
          <span className="status">{data?.exceptions?.length ?? 0} open</span>
        </div>

        <label style={{ display: 'block', marginBottom: 14 }}>
          <span>Resolution remarks</span>
          <input value={resolutionRemarks} onChange={(event) => setResolutionRemarks(event.target.value)} placeholder="Required before Resolve" />
        </label>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Type</th><th>Entity</th><th>Item</th><th>Expected / Observed</th><th>Blocking</th><th>Reported</th><th>Action</th></tr></thead>
            <tbody>
              {!data?.exceptions?.length ? (
                <tr><td colSpan={7} style={{ color: 'var(--muted)' }}>No open traceability exceptions.</td></tr>
              ) : data.exceptions.map((row) => (
                <tr key={row.name}>
                  <td><strong>{row.exception_type}</strong></td>
                  <td>{row.entity_type} · {row.entity_id}</td>
                  <td>{row.item_code ?? '—'}</td>
                  <td>{row.expected_label ?? '—'} / {row.observed_label ?? '—'}</td>
                  <td>{row.blocking ? 'Yes' : 'No'}</td>
                  <td>{row.reported_by ?? '—'}<br/><small>{row.reported_at ?? ''}</small></td>
                  <td><button className="action" type="button" disabled={busy} onClick={() => void resolve(row.name)}>Resolve</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="scan-note">
        <strong>Control rule:</strong> a prepared or unused serial label is not physical inventory. Only an actually identified physical item/assembly may contribute to stock reconciliation. Missing identity remains an exception until recovered and validated.
      </section>
    </main>
  );
}
