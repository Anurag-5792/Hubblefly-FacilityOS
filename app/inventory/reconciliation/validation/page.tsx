'use client';

import Link from 'next/link';
import { useState } from 'react';
import type {
  ValidationAction,
  ValidationPreview,
  ValidationRole,
  ValidationStatus,
} from '../../../../lib/reconciliation/validation';

type ApiResponse = ValidationPreview & {
  persisted?: boolean;
  note?: string;
};

export default function InventoryValidationPage() {
  const [status, setStatus] = useState<ValidationStatus>('SUBMITTED');
  const [role, setRole] = useState<ValidationRole>('inventory');
  const [actor, setActor] = useState('');
  const [remarks, setRemarks] = useState('');
  const [blockingExceptions, setBlockingExceptions] = useState(0);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [busy, setBusy] = useState(false);

  async function perform(action: ValidationAction) {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch('/api/inventory/reconciliation/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          currentStatus: status,
          actorRole: role,
          actorName: actor,
          remarks,
          blockingExceptions,
        }),
      });
      const payload = await response.json() as ApiResponse;
      setResult(payload);
      if (payload.ok) setStatus(payload.nextStatus);
    } catch {
      setResult({
        ok: false,
        currentStatus: status,
        nextStatus: status,
        openingStockGate: 'BLOCKED',
        message: 'Validation request failed.',
        errors: ['Validation request could not be completed.'],
      });
    } finally {
      setBusy(false);
    }
  }

  const inventoryStage = status === 'SUBMITTED';
  const adminStage = status === 'INVENTORY_VALIDATED';

  return (
    <main className="workflow-page">
      <header className="scan-header">
        <div>
          <Link className="back-link" href="/inventory/reconciliation">← Reconciliation</Link>
          <p className="eyebrow">Dual validation · Inventory + Admin</p>
          <h1>Inventory Validation</h1>
          <p className="lead">Physical inventory must be validated first by an Inventory user and then approved by an Admin. Admin cannot bypass the Inventory validation stage.</p>
        </div>
        <span className="preview-badge">Preview workflow</span>
      </header>

      <section className="stats-grid">
        <article className="stat-card"><span>Current Status</span><strong style={{fontSize: 16}}>{status}</strong></article>
        <article className="stat-card"><span>Inventory Stage</span><strong style={{fontSize: 18}}>{status === 'INVENTORY_VALIDATED' || status === 'ADMIN_APPROVED' ? 'Passed' : inventoryStage ? 'Pending' : '—'}</strong></article>
        <article className="stat-card"><span>Admin Stage</span><strong style={{fontSize: 18}}>{status === 'ADMIN_APPROVED' ? 'Passed' : adminStage ? 'Pending' : '—'}</strong></article>
        <article className="stat-card"><span>Opening Stock</span><strong style={{fontSize: 18}}>{status === 'ADMIN_APPROVED' && blockingExceptions === 0 ? 'Eligible' : 'Blocked'}</strong></article>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-heading">
          <div><p className="eyebrow">Operator</p><h2>Validation identity</h2></div>
          <span className="status">Role-controlled</span>
        </div>
        <div className="workflow-grid">
          <label>
            <span>Acting role</span>
            <select value={role} onChange={(event) => setRole(event.target.value as ValidationRole)}>
              <option value="inventory">Inventory Person</option>
              <option value="admin">Admin</option>
            </select>
            <small>Production will derive this from the signed-in FacilityOS user.</small>
          </label>
          <label>
            <span>Person</span>
            <input value={actor} onChange={(event) => setActor(event.target.value)} placeholder="Name / user ID" />
            <small>Stored in the audit trail once authentication is connected.</small>
          </label>
          <label>
            <span>Blocking exceptions</span>
            <input type="number" min={0} value={blockingExceptions} onChange={(event) => setBlockingExceptions(Number(event.target.value))} />
            <small>Inventory/Admin approval is blocked while this is greater than zero.</small>
          </label>
          <label>
            <span>Remarks</span>
            <input value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Required when rejecting" />
          </label>
        </div>
      </section>

      <section className="content-grid" style={{ marginBottom: 16 }}>
        <article className="panel">
          <p className="eyebrow">Stage 1</p>
          <h2>Inventory Person Validation</h2>
          <p className="lead">Verify physical quantity, serial/batch identity, condition, position/container placement, attached/WIP quantity and all reconciliation exceptions.</p>
          <div className="workflow-actions">
            <button className="primary-button" type="button" disabled={busy || role !== 'inventory' || status !== 'SUBMITTED'} onClick={() => void perform('inventory_validate')}>
              Validate Inventory
            </button>
            <button className="action" type="button" disabled={busy || role !== 'inventory' || status !== 'SUBMITTED'} onClick={() => void perform('inventory_reject')}>
              Return for Correction
            </button>
          </div>
        </article>

        <article className="panel">
          <p className="eyebrow">Stage 2</p>
          <h2>Admin Approval</h2>
          <p className="lead">Review the validated reconciliation summary, unresolved differences, evidence and audit trail before permitting the separate opening-stock approval step.</p>
          <div className="workflow-actions">
            <button className="primary-button" type="button" disabled={busy || role !== 'admin' || status !== 'INVENTORY_VALIDATED'} onClick={() => void perform('admin_approve')}>
              Approve as Admin
            </button>
            <button className="action" type="button" disabled={busy || role !== 'admin' || status !== 'INVENTORY_VALIDATED'} onClick={() => void perform('admin_reject')}>
              Reject to Inventory
            </button>
          </div>
        </article>
      </section>

      {(status === 'INVENTORY_REJECTED' || status === 'ADMIN_REJECTED') && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-heading"><div><p className="eyebrow">Correction</p><h2>Reopen Validation</h2></div></div>
          <button className="primary-button" type="button" disabled={busy || role !== 'inventory'} onClick={() => void perform('reopen')}>
            Reopen as Inventory Person
          </button>
        </section>
      )}

      {result && (
        <section className={result.ok ? 'panel workflow-result success' : 'panel workflow-result error'}>
          <p className="eyebrow">Validation result</p>
          <h2>{result.message}</h2>
          {result.errors.length > 0 && <ul>{result.errors.map((error) => <li key={error}>{error}</li>)}</ul>}
          <dl className="result-fields">
            <div><dt>New status</dt><dd>{result.nextStatus}</dd></div>
            <div><dt>Opening Stock Gate</dt><dd>{result.openingStockGate}</dd></div>
            <div><dt>Persisted</dt><dd>{result.persisted ? 'Yes' : 'No — preview only'}</dd></div>
          </dl>
          {result.note && <div className="preview-note" style={{ marginTop: 12 }}>{result.note}</div>}
        </section>
      )}

      <section className="scan-note">
        <strong>Production control:</strong> Inventory validation and Admin approval are separate audit events. Admin approval does not itself post opening stock; posting remains a separate controlled action after approval.
      </section>
    </main>
  );
}
