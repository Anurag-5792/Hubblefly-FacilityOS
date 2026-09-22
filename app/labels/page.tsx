'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { PrintBatchPreview, PrintLabelKind } from '../../lib/documents/types';

const kinds: Array<{ value: PrintLabelKind; label: string; note: string }> = [
  { value: 'SERIAL', label: 'Serial Sticker', note: 'One approved identity per physical serialized item.' },
  { value: 'BATCH', label: 'Batch Sticker', note: 'Batch identity; quantity is controlled separately.' },
  { value: 'POSITION', label: 'Rack / Position Sticker', note: 'Warehouse location QR.' },
  { value: 'CONTAINER', label: 'Container Sticker', note: 'BN / BX / BB QR identity.' },
  { value: 'BOX_CARD', label: 'Box / Bin Stock Card', note: 'Container QR + qty/capacity + latest movements.' },
  { value: 'GENERIC_ITEM', label: 'Generic Item Label', note: 'Single item type only; no inferred pack quantity.' },
];

type PreviewResponse = { ok: boolean; preview?: PrintBatchPreview; error?: string };
type JobResponse = { ok: boolean; persisted: boolean; jobId?: string; status?: string; note?: string; error?: string };

export default function LabelsPage() {
  const [kind, setKind] = useState<PrintLabelKind>('BOX_CARD');
  const [itemCode, setItemCode] = useState('');
  const [explicitPrintQty, setExplicitPrintQty] = useState(1);
  const [containerText, setContainerText] = useState('BN-014');
  const [preview, setPreview] = useState<PrintBatchPreview | null>(null);
  const [job, setJob] = useState<JobResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const containerIds = useMemo(
    () => containerText.split(/[\n,]+/).map((value) => value.trim().toUpperCase()).filter(Boolean),
    [containerText],
  );

  async function runPreview() {
    setBusy(true);
    setError('');
    setPreview(null);
    setJob(null);
    try {
      const response = await fetch('/api/labels/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, itemCode, explicitPrintQty, approvedQty: 0, containerIds }),
      });
      const payload = await response.json() as PreviewResponse;
      if (!payload.ok || !payload.preview) {
        setError(payload.error ?? 'Print preview could not be created.');
      } else {
        setPreview(payload.preview);
      }
    } catch {
      setError('Print preview could not be created.');
    } finally {
      setBusy(false);
    }
  }

  async function createJob() {
    if (!preview) return;
    setBusy(true);
    setError('');
    setJob(null);
    try {
      const response = await fetch('/api/labels/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, itemCode, explicitPrintQty, containerIds }),
      });
      const payload = await response.json() as JobResponse;
      if (!payload.ok) setError(payload.error ?? 'Print job could not be created.');
      else setJob(payload);
    } catch {
      setError('Print job could not be created.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workflow-page role-workspace">
      <header className="role-hero role-hero-admin">
        <div>
          <Link className="back-link role-back" href="/documents">← Document Centre</Link>
          <p className="eyebrow">Labels & Printing</p>
          <h1>Safe Print Control</h1>
          <p className="lead">Every print job shows the exact number of labels before approval. Inventory prepares the batch; Admin approves it; only then should production printing be released.</p>
        </div>
        <div className="role-identity-card">
          <span>Safety Gate</span><strong>Preview First</strong><small>Explicit qty → preview → Admin approve → print</small>
        </div>
      </header>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-heading"><div><p className="eyebrow">Print Request</p><h2>What do you want to print?</h2></div></div>
        <div className="print-kind-grid">
          {kinds.map((entry) => (
            <button
              type="button"
              key={entry.value}
              className={kind === entry.value ? 'print-kind-card print-kind-card-active' : 'print-kind-card'}
              onClick={() => { setKind(entry.value); setPreview(null); setJob(null); setError(''); }}
            >
              <strong>{entry.label}</strong>
              <span>{entry.note}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="workflow-grid">
          <label>
            <span>Item Code {kind === 'POSITION' || kind === 'CONTAINER' || kind === 'BOX_CARD' ? '(optional)' : ''}</span>
            <input value={itemCode} onChange={(event) => setItemCode(event.target.value.toUpperCase())} placeholder="e.g. PWR-BAT-01" />
          </label>
          <label>
            <span>Exact print quantity</span>
            <input type="number" min="1" step="1" value={explicitPrintQty} onChange={(event) => setExplicitPrintQty(Number(event.target.value))} />
            <small>Must be typed explicitly. FacilityOS never calculates this from stock qty, serial gaps or pack size.</small>
          </label>

          {kind === 'BOX_CARD' && (
            <label style={{ gridColumn: '1 / -1' }}>
              <span>Container IDs — exactly one ID per card</span>
              <textarea rows={6} value={containerText} onChange={(event) => setContainerText(event.target.value)} placeholder="BN-014&#10;BX-016&#10;BB-001" />
              <small>The number of unique container IDs must exactly equal the print quantity.</small>
            </label>
          )}
        </div>

        <div className="workflow-actions" style={{ marginTop: 16 }}>
          <button className="scan-primary" type="button" disabled={busy} onClick={() => void runPreview()}>
            {busy ? 'Checking…' : '1. Generate Safety Preview'}
          </button>
          {kind === 'BOX_CARD' && <Link className="action action-link" href="/labels/box-card">Open Box Card Layout</Link>}
        </div>
      </section>

      {error && <section className="panel workflow-result error" style={{ marginBottom: 16 }}><h2>Blocked</h2><div className="lookup-warning">{error}</div></section>}

      {preview && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-heading">
            <div><p className="eyebrow">Safety Preview</p><h2>{preview.kind.replaceAll('_', ' ')} batch</h2></div>
            <span className="preview-badge">approval required</span>
          </div>
          <dl className="result-fields">
            <div><dt>Exact requested labels</dt><dd>{preview.explicitPrintQty}</dd></div>
            <div><dt>Preview count</dt><dd>{preview.previewCount}</dd></div>
            <div><dt>Admin approval</dt><dd>Not yet</dd></div>
            <div><dt>Production print</dt><dd>Blocked</dd></div>
            {preview.itemCode && <div><dt>Item</dt><dd>{preview.itemCode}</dd></div>}
            {preview.containerIds && <div><dt>Containers</dt><dd>{preview.containerIds.join(', ')}</dd></div>}
          </dl>

          <div className="lookup-warning" style={{ marginTop: 14 }}>
            Check the count above before creating the print job. Creating a job does not print anything and does not create stock.
          </div>

          <div className="workflow-actions" style={{ marginTop: 16 }}>
            <button className="scan-primary" type="button" disabled={busy} onClick={() => void createJob()}>
              {busy ? 'Creating…' : '2. Create Print Job for Admin Approval'}
            </button>
          </div>
        </section>
      )}

      {job && (
        <section className="panel workflow-result success">
          <p className="eyebrow">Print Job</p>
          <h2>{job.persisted ? 'Print job created' : 'Preview job validated'}</h2>
          <dl className="result-fields">
            <div><dt>Job ID</dt><dd>{job.jobId ?? '—'}</dd></div>
            <div><dt>Status</dt><dd>{job.status ?? 'Previewed'}</dd></div>
            <div><dt>Persisted</dt><dd>{job.persisted ? 'Yes' : 'No — preview mode'}</dd></div>
          </dl>
          {job.note && <div className="preview-note" style={{ marginTop: 12 }}>{job.note}</div>}
          <div className="workflow-actions" style={{ marginTop: 16 }}>
            <Link className="action action-link" href="/admin/print-jobs">Open Admin Print Approval Queue</Link>
          </div>
        </section>
      )}

      <section className="role-rule-strip">
        <strong>Print rule:</strong> only Admin can approve a print batch. FacilityOS must never turn “852 batteries” into “142 boxes” unless those specific box identities and packing records are explicitly verified.
      </section>
    </main>
  );
}
