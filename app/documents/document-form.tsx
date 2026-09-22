'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { FacilityDocumentMutation, FacilityDocumentType, FacilityMovementDocument } from '../../lib/documents/types';

function prefix(type: FacilityDocumentType) {
  return type === 'GRN' ? 'GRN' : type === 'GATE_PASS' ? 'GP' : 'DC';
}

function title(type: FacilityDocumentType) {
  return type === 'GRN' ? 'Goods Receipt Note' : type === 'GATE_PASS' ? 'Gate Pass' : 'Delivery Challan';
}

export default function DocumentForm({ type }: { type: FacilityDocumentType }) {
  const [document, setDocument] = useState<FacilityMovementDocument>(() => ({
    id: prefix(type) + '-DRAFT',
    type,
    status: 'draft',
    company: 'Hubblefly Technologies Limited',
    warehouse: 'HFT Store',
    partyName: type === 'GRN' ? '' : undefined,
    supplierInvoice: type === 'GRN' ? '' : undefined,
    supplierInvoiceDate: type === 'GRN' ? '' : undefined,
    recipient: type === 'GRN' ? undefined : '',
    purpose: type === 'GRN' ? 'Live inward after opening stock' : '',
    vehicleNo: '',
    returnable: type === 'GATE_PASS',
    expectedReturnDate: type === 'GATE_PASS' ? '' : undefined,
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
      setResult({ ok: false, persisted: false, error: 'Document could not be validated.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workflow-page role-workspace">
      <header className="role-hero role-hero-inventory">
        <div>
          <Link className="back-link role-back" href="/documents">← Document Centre</Link>
          <p className="eyebrow">{type === 'GRN' ? 'Inward Control' : 'Outward Control'}</p>
          <h1>{title(type)}</h1>
          <p className="lead">
            {type === 'GRN'
              ? 'Create the FacilityOS receipt record first, then reconcile it with ERPNext before final submission.'
              : 'Create the operational movement document from verified item/serial/batch information. ERP posting remains separately controlled.'}
          </p>
        </div>
        <div className="role-identity-card">
          <span>Status</span><strong>DRAFT</strong><small>{prefix(type)} · Preview-safe</small>
        </div>
      </header>

      {type === 'GRN' && (
        <div className="lookup-warning" style={{ marginBottom: 16 }}>
          GRN applies to live inward after opening stock. Receipts already included in opening stock must not be entered again.
        </div>
      )}

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-heading"><div><p className="eyebrow">Header</p><h2>Document details</h2></div><span className="status">ERP posted: No</span></div>
        <div className="workflow-grid">
          <label><span>Company</span><input value={document.company} onChange={(e) => patch('company', e.target.value)} /></label>
          <label><span>Warehouse</span><input value={document.warehouse} onChange={(e) => patch('warehouse', e.target.value)} /></label>

          {type === 'GRN' ? (
            <>
              <label><span>Supplier</span><input value={document.partyName ?? ''} onChange={(e) => patch('partyName', e.target.value)} placeholder="Supplier name" /></label>
              <label><span>Supplier Invoice / Challan</span><input value={document.supplierInvoice ?? ''} onChange={(e) => patch('supplierInvoice', e.target.value)} /></label>
              <label><span>Invoice / Challan Date</span><input type="date" value={document.supplierInvoiceDate ?? ''} onChange={(e) => patch('supplierInvoiceDate', e.target.value)} /></label>
            </>
          ) : (
            <>
              <label><span>Recipient / To</span><input value={document.recipient ?? ''} onChange={(e) => patch('recipient', e.target.value)} placeholder="Person / company / site" /></label>
              <label><span>Purpose</span><input value={document.purpose ?? ''} onChange={(e) => patch('purpose', e.target.value)} placeholder="Trial / repair / customer / transfer / return..." /></label>
            </>
          )}

          <label><span>Vehicle No.</span><input value={document.vehicleNo ?? ''} onChange={(e) => patch('vehicleNo', e.target.value.toUpperCase())} /></label>

          {type === 'GATE_PASS' && (
            <>
              <label className="workflow-checkbox"><input type="checkbox" checked={document.returnable === true} onChange={(e) => patch('returnable', e.target.checked)} /><span>Returnable material</span></label>
              {document.returnable && <label><span>Expected Return Date</span><input type="date" value={document.expectedReturnDate ?? ''} onChange={(e) => patch('expectedReturnDate', e.target.value)} /></label>}
            </>
          )}
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-heading"><div><p className="eyebrow">Items</p><h2>Verified material lines</h2></div><button className="action" type="button" onClick={addLine}>+ Add Item</button></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table document-lines-table">
            <thead><tr><th>Item Code</th><th>Item Name</th><th>Qty</th><th>UOM</th><th>Serial No</th><th>Batch No</th><th>Container</th><th>Remarks</th><th></th></tr></thead>
            <tbody>
              {document.lines.map((line, index) => (
                <tr key={index}>
                  <td><input value={line.itemCode} onChange={(e) => patchLine(index, 'itemCode', e.target.value.toUpperCase())} /></td>
                  <td><input value={line.itemName ?? ''} onChange={(e) => patchLine(index, 'itemName', e.target.value)} /></td>
                  <td><input type="number" min="0" step="any" value={line.qty} onChange={(e) => patchLine(index, 'qty', Number(e.target.value))} /></td>
                  <td><input value={line.uom} onChange={(e) => patchLine(index, 'uom', e.target.value)} /></td>
                  <td><input value={line.serialNo ?? ''} onChange={(e) => patchLine(index, 'serialNo', e.target.value.toUpperCase())} /></td>
                  <td><input value={line.batchNo ?? ''} onChange={(e) => patchLine(index, 'batchNo', e.target.value.toUpperCase())} /></td>
                  <td><input value={line.containerId ?? ''} onChange={(e) => patchLine(index, 'containerId', e.target.value.toUpperCase())} /></td>
                  <td><input value={line.remarks ?? ''} onChange={(e) => patchLine(index, 'remarks', e.target.value)} /></td>
                  <td>{document.lines.length > 1 && <button type="button" className="text-button danger-text" onClick={() => removeLine(index)}>Remove</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="document-total">Total quantity: <strong>{totalQty}</strong></div>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-heading"><div><p className="eyebrow">Control</p><h2>Prepare → Check → Authorize</h2></div></div>
        <div className="document-stage-grid">
          <article><span>1</span><strong>Prepared</strong><small>Inventory user captures verified material and evidence.</small></article>
          <article><span>2</span><strong>Checked</strong><small>Second check confirms item, quantity, serial/batch and destination/source.</small></article>
          <article><span>3</span><strong>Authorized</strong><small>Authorized user permits document release/printing.</small></article>
          <article><span>4</span><strong>ERP Reconciled</strong><small>{type === 'GRN' ? 'Match ERP Purchase Receipt/Stock Entry.' : 'Match applicable ERP stock/document transaction.'}</small></article>
        </div>
      </section>

      <div className="workflow-actions">
        <button className="scan-primary" type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Checking…' : 'Validate & Save Draft'}</button>
        <Link className="action action-link" href={'/documents/print/' + type.toLowerCase()}>Print Preview</Link>
      </div>

      {result && (
        <section className={result.ok ? 'panel workflow-result success' : 'panel workflow-result error'} style={{ marginTop: 16 }}>
          <h2>{result.ok ? (result.persisted ? 'Draft saved' : 'Preview validated') : 'Validation failed'}</h2>
          {result.error && <div className="lookup-warning">{result.error}</div>}
          {result.note && <div className="preview-note">{result.note}</div>}
        </section>
      )}

      <section className="role-rule-strip">
        <strong>Control rule:</strong> no document created here automatically posts ERP stock. FacilityOS evidence and ERP transaction must be reconciled before final submission.
      </section>
    </main>
  );
}
