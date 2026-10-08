'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RouteCardResponse } from '../../../../lib/shopfloor/types';

type MutationResult = {
  ok: boolean;
  persisted: boolean;
  note?: string;
  error?: string;
};

type GenealogyType = 'BUILT_FROM' | 'INSTALLED_IN' | 'REMOVED_FROM' | 'REPLACED_BY';

export default function RouteCardPage() {
  const params = useParams<{ id: string }>();
  const id = useMemo(() => decodeURIComponent(params.id ?? ''), [params.id]);
  const [data, setData] = useState<RouteCardResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<MutationResult | null>(null);
  const [scannedComponent, setScannedComponent] = useState('');
  const [operationNote, setOperationNote] = useState('');
  const [eventType, setEventType] = useState<GenealogyType>('BUILT_FROM');
  const [parentId, setParentId] = useState('');
  const [childId, setChildId] = useState('');
  const [replacementId, setReplacementId] = useState('');
  const [genealogyNote, setGenealogyNote] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/shopfloor/route-card?id=' + encodeURIComponent(id), { cache: 'no-store' });
      const payload = await response.json() as RouteCardResponse;
      setData(payload);
      if (payload.routeCard?.serialNo) {
        setParentId((current) => current || payload.routeCard?.serialNo || '');
      }
    } catch {
      setData({ ok: false, source: 'sample', error: 'Route card could not be loaded.' });
    } finally {
      setBusy(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const card = data?.routeCard;
  const complete = card?.operations.filter((operation) => operation.status === 'complete').length ?? 0;
  const total = card?.operations.length ?? 0;
  const progress = total ? Math.round((complete / total) * 100) : 0;
  const currentOperation = card?.operations.find((operation) => operation.sequence === card.currentOperation);

  async function completeCurrentOperation() {
    if (!card || !currentOperation) return;
    setSaving(true);
    setResult(null);
    try {
      const response = await fetch('/api/shopfloor/route-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete_operation',
          routeCardId: card.id,
          sequence: currentOperation.sequence,
          scannedComponent: scannedComponent.trim() || undefined,
          note: operationNote.trim() || undefined,
        }),
      });
      const payload = await response.json() as MutationResult;
      setResult(payload);
      if (payload.ok) {
        setScannedComponent('');
        setOperationNote('');
        if (payload.persisted) await load();
      }
    } catch {
      setResult({ ok: false, persisted: false, error: 'Operation could not be completed.' });
    } finally {
      setSaving(false);
    }
  }

  async function recordGenealogy() {
    if (!card) return;
    setSaving(true);
    setResult(null);
    try {
      const response = await fetch('/api/shopfloor/route-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_genealogy',
          routeCardId: card.id,
          eventType,
          parentId: parentId.trim(),
          childId: childId.trim(),
          replacementId: replacementId.trim() || undefined,
          note: genealogyNote.trim() || undefined,
        }),
      });
      const payload = await response.json() as MutationResult;
      setResult(payload);
      if (payload.ok) {
        setChildId('');
        setReplacementId('');
        setGenealogyNote('');
        if (payload.persisted) await load();
      }
    } catch {
      setResult({ ok: false, persisted: false, error: 'Genealogy event could not be recorded.' });
    } finally {
      setSaving(false);
    }
  }

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
            <article className="role-kpi"><span>Current Operation</span><strong>#{card.currentOperation}</strong><small>{currentOperation?.operation ?? 'Route complete'}</small></article>
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
              <div className="panel-heading"><div><p className="eyebrow">Current Job</p><h2>{currentOperation?.operation ?? 'Route complete'}</h2></div></div>
              {currentOperation ? (
                <>
                  <div className="workflow-grid">
                    <label>
                      <span>Scanned component identity</span>
                      <input value={scannedComponent} onChange={(event) => setScannedComponent(event.target.value.toUpperCase())} placeholder={currentOperation.expectedComponent ?? 'Serial / SFG / component ID'} />
                      <small>{currentOperation.expectedComponent ? 'Expected: ' + currentOperation.expectedComponent : 'Optional unless this operation requires component identity.'}</small>
                    </label>
                    <label>
                      <span>Operation note</span>
                      <input value={operationNote} onChange={(event) => setOperationNote(event.target.value)} placeholder="Inspection / assembly note" />
                    </label>
                  </div>
                  <div className="workflow-actions" style={{ marginTop: 14 }}>
                    <Link className="action action-link" href="/inventory/scan">Scan / Resolve Component</Link>
                    <button className="scan-primary" type="button" disabled={saving} onClick={() => void completeCurrentOperation()}>
                      {saving ? 'Saving…' : 'Complete Current Operation'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="preview-note">All route operations are complete.</div>
              )}
            </section>

            <section className="panel">
              <div className="panel-heading"><div><p className="eyebrow">Genealogy Event</p><h2>Record assembly identity</h2></div></div>
              <div className="workflow-grid">
                <label><span>Event</span><select value={eventType} onChange={(event) => setEventType(event.target.value as GenealogyType)}><option>BUILT_FROM</option><option>INSTALLED_IN</option><option>REMOVED_FROM</option><option>REPLACED_BY</option></select></label>
                <label><span>Parent ID</span><input value={parentId} onChange={(event) => setParentId(event.target.value.toUpperCase())} /></label>
                <label><span>Child ID</span><input value={childId} onChange={(event) => setChildId(event.target.value.toUpperCase())} placeholder="Component / SFG identity" /></label>
                {eventType === 'REPLACED_BY' && <label><span>Replacement ID</span><input value={replacementId} onChange={(event) => setReplacementId(event.target.value.toUpperCase())} /></label>}
                <label><span>Note</span><input value={genealogyNote} onChange={(event) => setGenealogyNote(event.target.value)} /></label>
              </div>
              <div className="workflow-actions" style={{ marginTop: 14 }}>
                <button className="scan-primary" type="button" disabled={saving || !parentId.trim() || !childId.trim()} onClick={() => void recordGenealogy()}>
                  {saving ? 'Saving…' : 'Record Genealogy Event'}
                </button>
              </div>
            </section>
          </div>

          {result && (
            <section className={result.ok ? 'panel workflow-result success' : 'panel workflow-result error'} style={{ marginBottom: 16 }}>
              <p className="eyebrow">Shopfloor result</p>
              <h2>{result.ok ? (result.persisted ? 'FacilityOS record saved' : 'Preview validated') : 'Action failed'}</h2>
              {result.error && <div className="lookup-warning">{result.error}</div>}
              {result.note && <div className="preview-note">{result.note}</div>}
            </section>
          )}

          <section className="panel" id="genealogy" style={{ marginBottom: 16 }}>
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

          <section className="role-rule-strip">
            <strong>Shopfloor control:</strong> component identity must be resolved before genealogy is recorded. Open traceability exceptions block genealogy for that component. No Shopfloor action posts ERPNext stock.
          </section>
        </>
      )}
    </main>
  );
}
