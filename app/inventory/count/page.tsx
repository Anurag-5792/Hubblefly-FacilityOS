'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { resolveQr } from '../../../lib/qr-resolver';

type PreviewResponse = {
  ok: boolean;
  errors: string[];
  postingMode: string;
  note: string;
};

export default function CountPage() {
  const [target, setTarget] = useState('');
  const [quantity, setQuantity] = useState('0');
  const [condition, setCondition] = useState('Good');
  const [container, setContainer] = useState('');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTarget(params.get('target') ?? '');
  }, []);

  const targetResolved = useMemo(() => resolveQr(target), [target]);
  const containerResolved = useMemo(() => resolveQr(container), [container]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setPreview(null);
    try {
      const response = await fetch('/api/inventory/count/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, quantity: Number(quantity), condition, container: container || undefined }),
      });
      setPreview(await response.json());
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workflow-page">
      <header className="scan-header">
        <div>
          <Link className="back-link" href="/inventory/scan">← Scanner</Link>
          <p className="eyebrow">Inventory workflow</p>
          <h1>Physical count</h1>
          <p className="lead">Capture verified physical quantity without silently changing ERPNext. Reconciliation and posting remain separate approval steps.</p>
        </div>
        <span className="preview-badge">Physical truth first</span>
      </header>

      <form className="panel workflow-form" onSubmit={submit}>
        <div className="workflow-grid">
          <label><span>Count target QR / ID</span><input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Serial, batch, position or container" /><small>{target ? `${targetResolved.type.toUpperCase()} · ${targetResolved.title}` : 'Scan or type target'}</small></label>
          <label><span>Physical quantity</span><input type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
          <label><span>Container (optional)</span><input value={container} onChange={(e) => setContainer(e.target.value)} placeholder="BN / BX / BB" /><small>{container ? `${containerResolved.type.toUpperCase()} · ${containerResolved.title}` : 'Optional physical container'}</small></label>
          <label><span>Condition</span><select value={condition} onChange={(e) => setCondition(e.target.value)}><option>Good</option><option>Damaged</option><option>Repair</option><option>Quarantine</option><option>Scrap</option></select></label>
        </div>
        <div className="workflow-actions"><button className="scan-primary" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Validate Count'}</button><span>Validation only — no ERPNext adjustment is submitted.</span></div>
      </form>

      {preview && <section className={preview.ok ? 'panel workflow-result success' : 'panel workflow-result error'}><p className="eyebrow">Validation result</p><h2>{preview.ok ? 'Count is ready for verification' : 'Count needs correction'}</h2>{preview.errors?.length > 0 && <ul>{preview.errors.map((error) => <li key={error}>{error}</li>)}</ul>}{preview.ok && <dl className="result-fields"><div><dt>Posting mode</dt><dd>{preview.postingMode}</dd></div><div><dt>Control note</dt><dd>{preview.note}</dd></div></dl>}</section>}
    </main>
  );
}
