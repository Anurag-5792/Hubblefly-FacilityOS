'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { resolveQr } from '../../../lib/qr-resolver';

type PreviewResponse = {
  ok: boolean;
  errors: string[];
  postingMode: string;
  erpNextTransaction: string;
};

export default function MovePage() {
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [condition, setCondition] = useState('Good');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSource(params.get('source') ?? '');
    setDestination(params.get('destination') ?? '');
  }, []);

  const sourceResolved = useMemo(() => resolveQr(source), [source]);
  const destinationResolved = useMemo(() => resolveQr(destination), [destination]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setPreview(null);
    try {
      const response = await fetch('/api/inventory/move/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, destination, quantity: Number(quantity), condition }),
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
          <h1>Move stock</h1>
          <p className="lead">Scan the source and destination. FacilityOS validates the move before any ERPNext transaction is allowed.</p>
        </div>
        <span className="preview-badge">Preview only</span>
      </header>

      <form className="panel workflow-form" onSubmit={submit}>
        <div className="workflow-grid">
          <label><span>Source QR / ID</span><input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Serial, batch or container" /><small>{source ? `${sourceResolved.type.toUpperCase()} · ${sourceResolved.title}` : 'Scan or type source'}</small></label>
          <label><span>Destination QR / ID</span><input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Position or container" /><small>{destination ? `${destinationResolved.type.toUpperCase()} · ${destinationResolved.title}` : 'Scan or type destination'}</small></label>
          <label><span>Quantity</span><input type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
          <label><span>Condition</span><select value={condition} onChange={(e) => setCondition(e.target.value)}><option>Good</option><option>Damaged</option><option>Repair</option><option>Quarantine</option><option>Scrap</option></select></label>
        </div>
        <div className="workflow-actions"><button className="scan-primary" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Validate Move'}</button><span>No stock is posted at this stage.</span></div>
      </form>

      {preview && <section className={preview.ok ? 'panel workflow-result success' : 'panel workflow-result error'}><p className="eyebrow">Validation result</p><h2>{preview.ok ? 'Move is structurally valid' : 'Move needs correction'}</h2>{preview.errors?.length > 0 && <ul>{preview.errors.map((error) => <li key={error}>{error}</li>)}</ul>}{preview.ok && <dl className="result-fields"><div><dt>Posting mode</dt><dd>{preview.postingMode}</dd></div><div><dt>Future ERPNext action</dt><dd>{preview.erpNextTransaction}</dd></div></dl>}</section>}
    </main>
  );
}
