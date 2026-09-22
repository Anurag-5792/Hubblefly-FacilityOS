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

type PreviewResponse = { ok: boolean; preview?: PrintBatchPreview; error?: string; persisted?: boolean };

export default function LabelsPage() {
  const [kind, setKind] = useState<PrintLabelKind>('BOX_CARD');
  const [itemCode, setItemCode] = useState('');
  const [explicitPrintQty, setExplicitPrintQty] = useState(1);
  const [approvedQty, setApprovedQty] = useState(0);
  const [containerText, setContainerText] = useState('BN-014');
  const [preview, setPreview] = useState<PrintBatchPreview | null>(null);
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
    try {
      const response = await fetch('/api/labels/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, itemCode, explicitPrintQty, approvedQty, containerIds }),
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

  return (
    <main className="workflow-page role-workspace">
      <header className="role-hero role-hero-admin">
        <div>
          <Link className="back-link role-back" href="/documents">← Document Centre</Link>
          <p className="eyebrow">Labels & Printing</p>
          <h1>Safe Print Control</h1>
          <p className="lead">Every print job must show its exact label count before release. FacilityOS does not calculate print quantity from stock quantity, serial gaps or an assumed pack size.</p>
        </div>
        <div className="role-identity-card">
          <span>Safety Gate</span><strong>Preview First</strong><small>Explicit qty → review → approve → print</small>
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
              onClick={() => { setKind(entry.value); setPreview(null); setError(''); }}
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
            <span>Item Code {kind === 'POSITION' || kind === 'CONTAINER' ? '(optional)' : ''}</span>
            <input value={itemCode} onChange={(event) => setItemCode(event.target.value.toUpperCase())} placeholder="e.g. PWR-BAT-01" />
          </label>
          <label>
            <span>Exact print quantity</span>
            <input type="number" min="1" step="1" value={explicitPrintQty} onChange={(event) => setExplicitPrintQty(Number(event.target.value))} />
            <small>Must be entered manually. Never auto-filled from physical qty or pack size.</small>
          </label>
          <label>
            <span>Approved quantity</span>
            <input type="number" min="0" step="1" value={approvedQty} onChange={(event) => setApprovedQty(Number(event.target.value))} />
            <small>0 means preview only. Approved qty cannot safely exceed requested qty.</small>
          </label>

          {kind === 'BOX_CARD' && (
            <label style={{ gridColumn: '1 / -1' }}>
              <span>Container IDs — one per card</span>
              <textarea rows={6} value={containerText} onChange={(event) => setContainerText(event.target.value)} placeholder="BN-014&#10;BX-016&#10;BB-001" />
              <small>For Box Cards, the number of container IDs must exactly equal the print quantity.</small>
            </label>
          )}
        </div>

        <div className="workflow-actions" style={{ marginTop: 16 }}>
          <button className="scan-primary" type="button" disabled={busy} onClick={() => void runPreview()}>
            {busy ? 'Checking…' : 'Generate Print Preview'}
          </button>
          {kind === 'BOX_CARD' && <Link className="action action-link" href="/labels/box-card">Open Box Card Preview</Link>}
        </div>
      </section>

      {error && <section className="panel workflow-result error"><h2>Print blocked</h2><div className="lookup-warning">{error}</div></section>}

      {preview && (
        <section className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Safety Preview</p><h2>{preview.kind.replaceAll('_', ' ')} print batch</h2></div>
            <span className={preview.status === 'approved' ? 'preview-badge live-badge' : 'preview-badge'}>{preview.status}</span>
          </div>
          <dl className="result-fields">
            <div><dt>Exact requested labels</dt><dd>{preview.explicitPrintQty}</dd></div>
            <div><dt>Preview pages/labels</dt><dd>{preview.previewCount}</dd></div>
            <div><dt>Approved quantity</dt><dd>{preview.approvedQty}</dd></div>
            <div><dt>Approval required</dt><dd>{preview.requiresApproval ? 'Yes' : 'No'}</dd></div>
            {preview.itemCode && <div><dt>Item</dt><dd>{preview.itemCode}</dd></div>}
            {preview.containerIds && <div><dt>Containers</dt><dd>{preview.containerIds.join(', ')}</dd></div>}
          </dl>

          {preview.status !== 'approved' ? (
            <div className="lookup-warning" style={{ marginTop: 14 }}>
              Preview only. Printing should stay disabled until the approved quantity exactly covers the requested print batch.
            </div>
          ) : (
            <div className="preview-note" style={{ marginTop: 14 }}>
              Quantity gate passed. Production printing still remains disabled until the live print engine and backend audit are connected.
            </div>
          )}
        </section>
      )}

      <section className="role-rule-strip">
        <strong>Print rule:</strong> labels are created from explicit approved identities/counts. FacilityOS must never turn “852 batteries” into “142 boxes” unless an authorized packing record explicitly says those 142 specific boxes exist.
      </section>
    </main>
  );
}
