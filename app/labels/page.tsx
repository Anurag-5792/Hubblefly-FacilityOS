'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { PrintBatchPreview, PrintLabelKind } from '../../lib/documents/types';

const kinds: Array<{ value: PrintLabelKind; label: string; note: string }> = [
  { value: 'SERIAL', label: 'Serial Sticker', note: 'Print only explicit serial identities; unused/void identities are blocked in live mode.' },
  { value: 'BATCH', label: 'Batch Sticker', note: 'Print only explicit batch identities; quantity is controlled separately.' },
  { value: 'POSITION', label: 'Rack / Position Sticker', note: 'Print existing Facility Position identities.' },
  { value: 'CONTAINER', label: 'Container Sticker', note: 'Print existing BN / BX / BB identities.' },
  { value: 'BOX_CARD', label: 'Box / Bin Stock Card', note: 'Container QR + qty/capacity + latest movements.' },
  { value: 'GENERIC_ITEM', label: 'Generic Item Label', note: 'Repeated item label; still requires explicit print quantity and Admin approval.' },
];

type PreviewResponse = { ok: boolean; preview?: PrintBatchPreview; error?: string };
type JobResponse = { ok: boolean; persisted: boolean; jobId?: string; status?: string; note?: string; error?: string };

const identityKinds = new Set<PrintLabelKind>(['SERIAL', 'BATCH', 'POSITION', 'CONTAINER']);

export default function LabelsPage() {
  const [kind, setKind] = useState<PrintLabelKind>('BOX_CARD');
  const [itemCode, setItemCode] = useState('');
  const [explicitPrintQty, setExplicitPrintQty] = useState(1);
  const [identityText, setIdentityText] = useState('');
  const [containerText, setContainerText] = useState('BN-014');
  const [printMode, setPrintMode] = useState<'initial' | 'reprint'>('initial');
  const [reason, setReason] = useState('Verified store label requirement');
  const [sourceReference, setSourceReference] = useState('');
  const [preview, setPreview] = useState<PrintBatchPreview | null>(null);
  const [job, setJob] = useState<JobResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const labelIds = useMemo(
    () => identityText.split(/[\n,]+/).map((value) => value.trim().toUpperCase()).filter(Boolean),
    [identityText],
  );

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
        body: JSON.stringify({
          kind,
          itemCode,
          explicitPrintQty,
          labelIds,
          containerIds,
          printMode,
          reason,
        }),
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
        body: JSON.stringify({
          kind,
          itemCode,
          explicitPrintQty,
          labelIds,
          containerIds,
          printMode,
          reason,
          sourceReference,
        }),
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

  function chooseKind(next: PrintLabelKind) {
    setKind(next);
    setPreview(null);
    setJob(null);
    setError('');
    setIdentityText('');
    if (next !== 'BOX_CARD') setContainerText('');
  }

  return (
    <main className="workflow-page role-workspace">
      <header className="role-hero role-hero-admin">
        <div>
          <Link className="back-link role-back" href="/documents">← Document Centre</Link>
          <p className="eyebrow">Labels & Printing</p>
          <h1>Safe Print Control</h1>
          <p className="lead">FacilityOS prints explicit identities only. Inventory prepares the exact batch; Admin approves the exact count; production printing happens only after approval.</p>
        </div>
        <div className="role-identity-card">
          <span>Safety Gate</span><strong>Explicit IDs</strong><small>Identity list → preview → Admin approve → print</small>
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
              onClick={() => chooseKind(entry.value)}
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
            <small>Typed manually. Never calculated from stock qty, serial gaps or pack size.</small>
          </label>

          <label>
            <span>Print mode</span>
            <select value={printMode} onChange={(event) => setPrintMode(event.target.value === 'reprint' ? 'reprint' : 'initial')}>
              <option value="initial">Initial print</option>
              <option value="reprint">Reprint / replacement label</option>
            </select>
          </label>

          <label>
            <span>Reason</span>
            <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why are these labels being printed?" />
            <small>Required for audit. Reprints must state why the original label needs replacement.</small>
          </label>

          <label>
            <span>Source Reference (optional)</span>
            <input value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} placeholder="Count sheet / GRN / approval / job reference" />
          </label>

          {identityKinds.has(kind) && (
            <label style={{ gridColumn: '1 / -1' }}>
              <span>Exact identities — one per label</span>
              <textarea
                rows={7}
                value={identityText}
                onChange={(event) => setIdentityText(event.target.value)}
                placeholder={
                  kind === 'SERIAL'
                    ? 'PSY-MTR-03-S0042\nPSY-MTR-03-S0043'
                    : kind === 'BATCH'
                      ? 'PWR-BAT-01-B001\nPWR-BAT-01-B002'
                      : kind === 'POSITION'
                        ? 'R03-L2-P04-S1\nR03-L2-P04-S2'
                        : 'BN-014\nBX-016'
                }
              />
              <small>{labelIds.length} explicit identity/identities entered. This must exactly match the print quantity.</small>
            </label>
          )}

          {kind === 'BOX_CARD' && (
            <label style={{ gridColumn: '1 / -1' }}>
              <span>Container IDs — exactly one ID per card</span>
              <textarea rows={7} value={containerText} onChange={(event) => setContainerText(event.target.value)} placeholder="BN-014&#10;BX-016&#10;BB-001" />
              <small>{containerIds.length} container(s) entered. This must exactly match the print quantity.</small>
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
            <span className="preview-badge">Admin approval required</span>
          </div>
          <dl className="result-fields">
            <div><dt>Exact requested labels</dt><dd>{preview.explicitPrintQty}</dd></div>
            <div><dt>Preview count</dt><dd>{preview.previewCount}</dd></div>
            <div><dt>Print mode</dt><dd>{preview.printMode === 'reprint' ? 'Reprint' : 'Initial'}</dd></div>
            <div><dt>Reason</dt><dd>{preview.reason}</dd></div>
            <div><dt>Admin approval</dt><dd>Not yet</dd></div>
            <div><dt>Production print</dt><dd>Blocked</dd></div>
            {preview.itemCode && <div><dt>Item</dt><dd>{preview.itemCode}</dd></div>}
            {preview.labelIds && preview.labelIds.length > 0 && <div><dt>Identities</dt><dd>{preview.labelIds.join(', ')}</dd></div>}
            {preview.containerIds && preview.containerIds.length > 0 && <div><dt>Containers</dt><dd>{preview.containerIds.join(', ')}</dd></div>}
          </dl>

          <div className="lookup-warning" style={{ marginTop: 14 }}>
            Verify the exact identity list and count. Creating a print job does not create stock, change serial status or print anything.
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
        <strong>Print rule:</strong> quantity alone is never enough for Serial, Batch, Position, Container or Box Card printing. The exact identities must also be supplied and approved.
      </section>
    </main>
  );
}
