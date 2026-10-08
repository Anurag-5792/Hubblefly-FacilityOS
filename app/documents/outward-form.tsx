'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { FacilityDocumentMutation, FacilityMovementDocument } from '../../lib/documents/types';

export default function OutwardMovementForm() {
  const [document, setDocument] = useState<FacilityMovementDocument>(() => ({
    id: 'OUT-DRAFT',
    type: 'OUTWARD',
    status: 'draft',
    documentDate: new Date().toISOString().slice(0, 10),
    company: 'Hubblefly Technologies Limited',
    warehouse: 'HFT Store',
    recipient: '',
    purpose: '',
    vehicleNo: '',
    returnable: false,
    expectedReturnDate: '',
    generateGatePass: true,
    generateDeliveryChallan: true,
    erpReconciliationStatus: 'not_linked',
    lines: [{ itemCode: '', itemName: '', qty: 1, uom: 'Nos', serialNo: '', batchNo: '', containerId: '', remarks: '' }],
    erpNextPosted: false,
  }));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FacilityDocumentMutation | null>(null);

  const totalQty = useMemo(() => document.lines.reduce((sum, line) => sum + (Number(line.qty) || 0), 0), [document.lines]);

  function patch<K extends keyof FacilityMovementDocument>(key: K, value: FacilityMovementDocument[K]) {
    setDocument((current) => ({ ...current, [key]: value }));
  }

  function patchLine(index: number, key: keyof FacilityMovementDocument['lines'][number], value: string | number) {
    setDocument((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line),
    }));
  }

  function addLine() {
    setDocument((current) => ({
      ...current,
      lines: [...current.lines, { itemCode: '', itemName: '', qty: 1, uom: 'Nos', serialNo: '', batchNo: '', containerId: '', remarks: '' }],
    }));
  }

  function removeLine(index: number) {
    setDocument((current) => ({ ...current, lines: current.lines.filter((_, lineIndex) => lineIndex !== index) }));
  }

  async function save() {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document }),
      });
      const payload = await response.json() as FacilityDocumentMutation;
      setResult(payload);
    } catch {
      setResult({ ok: false, persisted: false, error: 'Outward movement could not be validated.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workflow-page role-workspace">
      <header className="role-hero role-hero-inventory">
        <div>
          <Link className="back-link role-back" href="/documents">← Document Centre</Link>
          <p className="eyebrow">Outward Control</p>
          <h1>One Outward Movement</h1>
          <p className="lead">Enter the movement once. FacilityOS can generate the Gate Pass and Delivery Challan from the same verified material record.</p>
        </div>
        <div className="role-identity-card">
          <span>Control</span><strong>Single Source</strong><small>Movement → GP / DC → ERP reconciliation</small>
        </div>
      </header>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-heading"><div><p className="eyebrow">Documents</p><h2>What should this movement generate?</h2></div><span className="status">No ERP posting</span></div>
        <div className="document-output-grid">
          <label className={document.generateGatePass ? 'document-output-card document-output-card-active' : 'document-output-card'}>
            <input type="checkbox" checked={document.generateGatePass === true} onChange={(event) => patch('generateGatePass', event.target.checked)} />
            <div><strong>Gate Pass</strong><span>Operational gate/security document. Can be returnable or non-returnable.</span></div>
          </label>
          <label className={document.generateDeliveryChallan ? 'document-output-card document-output-card-active' : 'document-output-card'}>
            <input type="checkbox" checked={document.generateDeliveryChallan === true} onChange={(event) => patch('generateDeliveryChallan', event.target.checked)} />
            <div><strong>Delivery Challan</strong><span>Material document produced from the same outward movement data.</span></div>
          </label>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-heading"><div><p className="eyebrow">Header</p><h2>Movement details</h2></div></div>
        <div className="workflow-grid">
          <label><span>Movement Date</span><input type="date" value={document.documentDate} onChange={(event) => patch('documentDate', event.target.value)} /></label>
          <label><span>Company</span><input value={document.company} onChange={(event) => patch('company', event.target.value)} /></label>
          <label><span>From Warehouse</span><input value={document.warehouse} onChange={(event) => patch('warehouse', event.target.value)} /></label>
          <label><span>Recipient / To</span><input value={document.recipient ?? ''} onChange={(event) => patch('recipient', event.target.value)} placeholder="Person / company / site" /></label>
          <label><span>Purpose</span><input value={document.purpose ?? ''} onChange={(event) => patch('purpose', event.target.value)} placeholder="Trial / repair / customer / transfer / return..." /></label>
          <label><span>Vehicle No.</span><input value={document.vehicleNo ?? ''} onChange={(event) => patch('vehicleNo', event.target.value.toUpperCase())} /></label>
          <label className="workflow-checkbox"><input type="checkbox" checked={document.returnable === true} onChange={(event) => patch('returnable', event.target.checked)} /><span>Returnable material</span></label>
          {document.returnable && <label><span>Expected Return Date</span><input type="date" value={document.expectedReturnDate ?? ''} onChange={(event) => patch('expectedReturnDate', event.target.value)} /></label>}
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-heading"><div><p className="eyebrow">Material</p><h2>Verified outward lines</h2></div><button className="action" type="button" onClick={addLine}>+ Add Item</button></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table document-lines-table">
            <thead><tr><th>Item Code</th><th>Item Name</th><th>Qty</th><th>UOM</th><th>Serial No</th><th>Batch No</th><th>Container</th><th>Remarks</th><th></th></tr></thead>
            <tbody>
              {document.lines.map((line, index) => (
                <tr key={index}>
                  <td><input value={line.itemCode} onChange={(event) => patchLine(index, 'itemCode', event.target.value.toUpperCase())} /></td>
                  <td><input value={line.itemName ?? ''} onChange={(event) => patchLine(index, 'itemName', event.target.value)} /></td>
                  <td><input type="number" min="0" step="any" value={line.qty} onChange={(event) => patchLine(index, 'qty', Number(event.target.value))} /></td>
                  <td><input value={line.uom} onChange={(event) => patchLine(index, 'uom', event.target.value)} /></td>
                  <td><input value={line.serialNo ?? ''} onChange={(event) => patchLine(index, 'serialNo', event.target.value.toUpperCase())} /></td>
                  <td><input value={line.batchNo ?? ''} onChange={(event) => patchLine(index, 'batchNo', event.target.value.toUpperCase())} /></td>
                  <td><input value={line.containerId ?? ''} onChange={(event) => patchLine(index, 'containerId', event.target.value.toUpperCase())} /></td>
                  <td><input value={line.remarks ?? ''} onChange={(event) => patchLine(index, 'remarks', event.target.value)} /></td>
                  <td>{document.lines.length > 1 && <button className="text-button danger-text" type="button" onClick={() => removeLine(index)}>Remove</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="document-total">Total quantity: <strong>{totalQty}</strong></div>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-heading"><div><p className="eyebrow">Release Flow</p><h2>Prepare → Check → Authorize → Reconcile</h2></div></div>
        <div className="document-stage-grid">
          <article><span>1</span><strong>Prepare</strong><small>Inventory user captures the verified movement.</small></article>
          <article><span>2</span><strong>Check</strong><small>Different checker verifies item, qty, serial/batch, recipient and purpose.</small></article>
          <article><span>3</span><strong>Authorize</strong><small>Admin authorizes the outward movement and document numbers.</small></article>
          <article><span>4</span><strong>ERP Reconcile</strong><small>Applicable ERP stock/document transaction is linked separately.</small></article>
        </div>
      </section>

      <div className="workflow-actions">
        <button className="scan-primary" type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Checking…' : 'Validate & Save Outward Draft'}</button>
        {document.generateGatePass && <Link className="action action-link" href="/documents/print/gate_pass">Gate Pass Layout</Link>}
        {document.generateDeliveryChallan && <Link className="action action-link" href="/documents/print/delivery_challan">DC Layout</Link>}
      </div>

      {result && (
        <section className={result.ok ? 'panel workflow-result success' : 'panel workflow-result error'} style={{ marginTop: 16 }}>
          <h2>{result.ok ? (result.persisted ? 'Outward draft saved' : 'Preview validated') : 'Validation failed'}</h2>
          {result.error && <div className="lookup-warning">{result.error}</div>}
          {result.note && <div className="preview-note">{result.note}</div>}
        </section>
      )}

      <section className="role-rule-strip">
        <strong>Outward rule:</strong> Gate Pass and Delivery Challan are outputs of one verified movement. Do not enter the same material twice just to create two documents.
      </section>
    </main>
  );
}
