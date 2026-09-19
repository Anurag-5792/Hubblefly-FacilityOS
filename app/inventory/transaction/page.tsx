'use client';

import Link from 'next/link';
import { FormEvent, Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { resolveQr } from '../../../lib/qr-resolver';

type Kind = 'receive' | 'issue' | 'return';

type Preview = {
  ok: boolean;
  errors: string[];
  postingMode?: string;
  futureErpNextAction?: string;
  entityType?: string;
  normalizedTarget?: string;
};

const labels: Record<Kind, { title: string; party: string; helper: string }> = {
  receive: {
    title: 'Receive inventory',
    party: 'Supplier / Source',
    helper: 'Capture inward inventory. ERPNext posting will only happen after document and source validation.',
  },
  issue: {
    title: 'Issue inventory',
    party: 'Recipient / Destination',
    helper: 'Capture outward inventory intent. Stock posting remains approval-controlled.',
  },
  return: {
    title: 'Return inventory',
    party: 'Return Source / Destination',
    helper: 'Capture a return against a verified source transaction or operational reference.',
  },
};

function InventoryTransactionContent() {
  const params = useSearchParams();
  const requested = (params.get('kind') ?? 'receive').toLowerCase();
  const kind: Kind = requested === 'issue' || requested === 'return' ? requested : 'receive';
  const [target, setTarget] = useState(params.get('target') ?? '');
  const [quantity, setQuantity] = useState('1');
  const [warehouse, setWarehouse] = useState('HFT Store');
  const [counterparty, setCounterparty] = useState('');
  const [reference, setReference] = useState('');
  const [condition, setCondition] = useState('Good');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const resolved = useMemo(() => resolveQr(target), [target]);
  const copy = labels[kind];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setPreview(null);
    try {
      const response = await fetch('/api/inventory/transaction/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, target, quantity: Number(quantity), warehouse, counterparty, reference, condition }),
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
          <p className="eyebrow">Inventory workflow · {kind}</p>
          <h1>{copy.title}</h1>
          <p className="lead">{copy.helper}</p>
        </div>
        <span className="preview-badge">Preview only</span>
      </header>

      <form className="panel workflow-form" onSubmit={submit}>
        <div className="workflow-grid">
          <label>
            <span>Serial / Batch QR</span>
            <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Scan serial or batch" />
            <small>{target ? `${resolved.type.toUpperCase()} · ${resolved.title}` : 'Scan or type target'}</small>
          </label>
          <label>
            <span>Quantity</span>
            <input type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <label>
            <span>Warehouse</span>
            <input value={warehouse} onChange={(e) => setWarehouse(e.target.value)} placeholder="ERPNext warehouse" />
          </label>
          <label>
            <span>{copy.party}</span>
            <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder={copy.party} />
          </label>
          <label>
            <span>Reference / Document</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="PO / PR / Gate Pass / Job / Manual reference" />
          </label>
          <label>
            <span>Condition</span>
            <select value={condition} onChange={(e) => setCondition(e.target.value)}>
              <option>Good</option>
              <option>Damaged</option>
              <option>Repair</option>
              <option>Quarantine</option>
              <option>Scrap</option>
            </select>
          </label>
        </div>
        <div className="workflow-actions">
          <button className="scan-primary" type="submit" disabled={busy}>{busy ? 'Checking…' : `Validate ${copy.title}`}</button>
          <span>No ERPNext document is submitted by this screen yet.</span>
        </div>
      </form>

      {preview && (
        <section className={preview.ok ? 'panel workflow-result success' : 'panel workflow-result error'}>
          <p className="eyebrow">Validation result</p>
          <h2>{preview.ok ? 'Transaction is ready for approval logic' : 'Transaction needs correction'}</h2>
          {preview.errors?.length > 0 && <ul>{preview.errors.map((error) => <li key={error}>{error}</li>)}</ul>}
          {preview.ok && (
            <dl className="result-fields">
              <div><dt>Target</dt><dd>{preview.normalizedTarget}</dd></div>
              <div><dt>Entity type</dt><dd>{preview.entityType}</dd></div>
              <div><dt>Posting mode</dt><dd>{preview.postingMode}</dd></div>
              <div><dt>Future ERPNext action</dt><dd>{preview.futureErpNextAction}</dd></div>
            </dl>
          )}
        </section>
      )}
    </main>
  );
}

export default function InventoryTransactionPage() {
  return (
    <Suspense fallback={<main className="workflow-page"><div className="panel">Loading transaction workflow…</div></main>}>
      <InventoryTransactionContent />
    </Suspense>
  );
}
