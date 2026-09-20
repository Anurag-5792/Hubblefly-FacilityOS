'use client';

import Link from 'next/link';
import { FormEvent, Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { resolveQr } from '../../../lib/qr-resolver';

type PreviewResponse = { ok: boolean; errors: string[]; postingMode: string; erpNextTransaction: string };
type SaveResponse = {
  ok: boolean;
  persisted: boolean;
  containerId?: string;
  fromPosition?: string | null;
  toPosition?: string;
  actor?: string;
  auditId?: string;
  erpNextPosted: boolean;
  note?: string;
  error?: string;
};

function MoveContent() {
  const params = useSearchParams();
  const [source, setSource] = useState(params.get('source') ?? '');
  const [destination, setDestination] = useState(params.get('destination') ?? '');
  const [quantity, setQuantity] = useState('1');
  const [condition, setCondition] = useState('Good');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [saved, setSaved] = useState<SaveResponse | null>(null);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const sourceResolved = useMemo(() => resolveQr(source), [source]);
  const destinationResolved = useMemo(() => resolveQr(destination), [destination]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setPreview(null);
    setSaved(null);
    try {
      const response = await fetch('/api/inventory/move/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, destination, quantity: Number(quantity), condition }),
      });
      setPreview(await response.json());
    } finally { setBusy(false); }
  }

  async function saveMove() {
    setSaving(true);
    setSaved(null);
    try {
      const response = await fetch('/api/inventory/move/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          destination,
          quantity: Number(quantity),
          condition,
          remarks,
        }),
      });
      setSaved(await response.json() as SaveResponse);
    } catch {
      setSaved({ ok: false, persisted: false, erpNextPosted: false, error: 'Move could not be saved.' });
    } finally {
      setSaving(false);
    }
  }

  const canPersistFacilityMove = sourceResolved.type === 'container' && destinationResolved.type === 'position';

  return (
    <main className="workflow-page">
      <header className="scan-header"><div><Link className="back-link" href="/inventory/scan">← Scanner</Link><p className="eyebrow">Inventory workflow</p><h1>Move stock</h1><p className="lead">Scan the source and destination. FacilityOS validates the move before any ERPNext transaction is allowed.</p></div><span className="preview-badge">Preview only</span></header>
      <form className="panel workflow-form" onSubmit={submit}>
        <div className="workflow-grid">
          <label><span>Source QR / ID</span><input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Serial, batch or container" /><small>{source ? `${sourceResolved.type.toUpperCase()} · ${sourceResolved.title}` : 'Scan or type source'}</small></label>
          <label><span>Destination QR / ID</span><input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Position or container" /><small>{destination ? `${destinationResolved.type.toUpperCase()} · ${destinationResolved.title}` : 'Scan or type destination'}</small></label>
          <label><span>Quantity</span><input type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
          <label><span>Condition</span><select value={condition} onChange={(e) => setCondition(e.target.value)}><option>Good</option><option>Damaged</option><option>Repair</option><option>Quarantine</option><option>Scrap</option></select></label>
          <label><span>Remarks (optional)</span><input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Reason / movement note" /></label>
        </div>
        <div className="workflow-actions"><button className="scan-primary" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Validate Move'}</button><span>No stock is posted at this stage.</span></div>
      </form>
      {preview && <section className={preview.ok ? 'panel workflow-result success' : 'panel workflow-result error'}><p className="eyebrow">Validation result</p><h2>{preview.ok ? 'Move is structurally valid' : 'Move needs correction'}</h2>{preview.errors?.length > 0 && <ul>{preview.errors.map((error) => <li key={error}>{error}</li>)}</ul>}{preview.ok && <><dl className="result-fields"><div><dt>ERPNext posting</dt><dd>Not performed</dd></div><div><dt>Future ERPNext action</dt><dd>{preview.erpNextTransaction}</dd></div></dl>{canPersistFacilityMove ? <div className="workflow-actions" style={{ marginTop: 16 }}><button className="primary-button" type="button" disabled={saving} onClick={() => void saveMove()}>{saving ? 'Saving…' : 'Save Container Location'}</button><span>Updates FacilityOS physical location only; ERPNext stock is unchanged.</span></div> : <div className="preview-note" style={{ marginTop: 16 }}>Serial/Batch stock moves remain preview-only until ERPNext posting UAT is approved.</div>}</>}</section>}
      {saved && <section className={saved.ok ? 'panel workflow-result success' : 'panel workflow-result error'} style={{ marginTop: 16 }}><p className="eyebrow">FacilityOS movement record</p><h2>{saved.ok ? (saved.persisted ? 'Container location updated' : 'Preview move validated') : 'Move was not saved'}</h2>{saved.error && <div className="lookup-warning">{saved.error}</div>}{saved.ok && <dl className="result-fields"><div><dt>Persisted</dt><dd>{saved.persisted ? 'Yes' : 'No — preview mode'}</dd></div><div><dt>Container</dt><dd>{saved.containerId ?? sourceResolved.normalized}</dd></div><div><dt>From</dt><dd>{saved.fromPosition ?? '—'}</dd></div><div><dt>To</dt><dd>{saved.toPosition ?? destinationResolved.normalized}</dd></div><div><dt>ERPNext posted</dt><dd>{saved.erpNextPosted ? 'Yes' : 'No'}</dd></div></dl>}{saved.note && <div className="preview-note" style={{ marginTop: 12 }}>{saved.note}</div>}</section>}
    </main>
  );
}

export default function MovePage() {
  return <Suspense fallback={<main className="workflow-page"><div className="panel">Loading move workflow…</div></main>}><MoveContent /></Suspense>;
}
