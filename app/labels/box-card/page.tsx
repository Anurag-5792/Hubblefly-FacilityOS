'use client';

import Link from 'next/link';
import FacilityQr from '../../../components/facility-qr';
import { useState } from 'react';
import type { BoxCardPreview } from '../../../lib/documents/types';

type BoxResponse = { ok: boolean; source?: string; card?: BoxCardPreview; error?: string };

export default function BoxCardPage() {
  const [containerId, setContainerId] = useState('BN-014');
  const [card, setCard] = useState<BoxCardPreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadCard() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/labels/box-card?id=' + encodeURIComponent(containerId.trim().toUpperCase()), { cache: 'no-store' });
      const payload = await response.json() as BoxResponse;
      if (!payload.ok || !payload.card) setError(payload.error ?? 'Box Card could not be loaded.');
      else setCard(payload.card);
    } catch {
      setError('Box Card could not be loaded.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workflow-page role-workspace">
      <header className="role-hero role-hero-inventory">
        <div>
          <Link className="back-link role-back" href="/labels">← Labels & Printing</Link>
          <p className="eyebrow">Box / Bin Control</p>
          <h1>Container Stock Card</h1>
          <p className="lead">A printable card for BN/BX/BB containers showing the QR identity, current quantity snapshot, capacity, position and the latest four In/Out movements.</p>
        </div>
        <div className="role-identity-card">
          <span>Format</span><strong>Box Card</strong><small>QR + stock snapshot + 4 movements</small>
        </div>
      </header>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="workflow-actions">
          <input value={containerId} onChange={(event) => setContainerId(event.target.value.toUpperCase())} placeholder="BN-014 / BX-016 / BB-001" />
          <button className="scan-primary" type="button" disabled={busy} onClick={() => void loadCard()}>{busy ? 'Loading…' : 'Load Box Card'}</button>
        </div>
      </section>

      {error && <div className="lookup-warning">{error}</div>}

      {card && (
        <>
          <section className="box-card-print" id="box-card-print">
            <div className="box-card-header">
              <div>
                <p>HUBBLEFLY FACILITYOS</p>
                <h2>{card.containerId}</h2>
                <span>{card.status}</span>
              </div>
              <FacilityQr value={card.qrPayload} size={104} label={card.containerId} />
            </div>

            <div className="box-card-item">
              <span>Item</span>
              <strong>{card.itemCode}</strong>
              <p>{card.itemName}</p>
            </div>

            <div className="box-card-stats">
              <div><span>Current Qty</span><strong>{card.currentQty} {card.uom}</strong></div>
              <div><span>Capacity</span><strong>{card.capacity ?? '—'} {card.capacity ? card.uom : ''}</strong></div>
              <div><span>Position</span><strong>{card.position ?? '—'}</strong></div>
            </div>

            {(card.serialNo || card.batchNo) && (
              <div className="box-card-identity">
                {card.serialNo && <div><span>Serial</span><strong>{card.serialNo}</strong></div>}
                {card.batchNo && <div><span>Batch</span><strong>{card.batchNo}</strong></div>}
              </div>
            )}

            <table className="box-card-movements">
              <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Balance</th><th>User / Initial</th></tr></thead>
              <tbody>
                {[0, 1, 2, 3].map((index) => {
                  const row = card.movements[index];
                  return row ? (
                    <tr key={index}><td>{row.date}</td><td>{row.qtyIn || ''}</td><td>{row.qtyOut || ''}</td><td>{row.balance}</td><td>{row.user}</td></tr>
                  ) : (
                    <tr key={index}><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>
                  );
                })}
              </tbody>
            </table>

            <div className="box-card-footer">Scan QR for full live contents and complete movement history.</div>
          </section>

          {card.note && <div className="preview-note" style={{ marginTop: 14 }}>{card.note}</div>}

          <div className="workflow-actions" style={{ marginTop: 16 }}>
            <button className="scan-primary" type="button" onClick={() => window.print()}>Print This Card</button>
            <Link className="action action-link" href={'/inventory/scan?value=' + encodeURIComponent(card.containerId)}>Open Container in FacilityOS</Link>
          </div>
        </>
      )}

      <section className="role-rule-strip">
        <strong>Box-card rule:</strong> the printed current quantity is only a snapshot at print time. The QR is the live truth. Reprint the card when you need a new current-quantity snapshot; do not hand-correct the QR identity.
      </section>
    </main>
  );
}
