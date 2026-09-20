'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FacilitySession } from '../../../../lib/auth/types';
import type { ReconciliationSummary } from '../../../../lib/reconciliation/types';
import type {
  ValidationAction,
  ValidationPreview,
  ValidationRole,
  ValidationStatus,
} from '../../../../lib/reconciliation/validation';

type ApiResponse = ValidationPreview & {
  persisted?: boolean;
  note?: string;
  actor?: string;
};

const statusMap: Record<string, ValidationStatus> = {
  Draft: 'DRAFT',
  Submitted: 'SUBMITTED',
  'Inventory Validated': 'INVENTORY_VALIDATED',
  'Inventory Rejected': 'INVENTORY_REJECTED',
  'Admin Approved': 'ADMIN_APPROVED',
  'Admin Rejected': 'ADMIN_REJECTED',
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  INVENTORY_VALIDATED: 'INVENTORY_VALIDATED',
  INVENTORY_REJECTED: 'INVENTORY_REJECTED',
  ADMIN_APPROVED: 'ADMIN_APPROVED',
  ADMIN_REJECTED: 'ADMIN_REJECTED',
};

export default function InventoryValidationPage() {
  const [status, setStatus] = useState<ValidationStatus>('DRAFT');
  const [previewRole, setPreviewRole] = useState<ValidationRole>('inventory');
  const [previewActor, setPreviewActor] = useState('');
  const [remarks, setRemarks] = useState('');
  const [blockingExceptions, setBlockingExceptions] = useState(0);
  const [sessionName, setSessionName] = useState('');
  const [auth, setAuth] = useState<FacilitySession | null>(null);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadContext = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryResponse, authResponse] = await Promise.all([
        fetch('/api/inventory/reconciliation', { cache: 'no-store' }),
        fetch('/api/auth/me', { cache: 'no-store' }),
      ]);

      const summaryPayload = await summaryResponse.json() as ReconciliationSummary;
      const authPayload = await authResponse.json() as FacilitySession;

      setSummary(summaryPayload);
      setAuth(authPayload);
      setSessionName(summaryPayload.sessionName ?? '');
      setBlockingExceptions(summaryPayload.blockingExceptions ?? summaryPayload.totals.exceptions ?? 0);

      const mapped = summaryPayload.validationStatus
        ? statusMap[summaryPayload.validationStatus]
        : undefined;
      if (mapped) setStatus(mapped);
    } catch {
      setResult({
        ok: false,
        currentStatus: status,
        nextStatus: status,
        openingStockGate: 'BLOCKED',
        message: 'Validation context could not be loaded.',
        errors: ['Check FacilityOS authentication and reconciliation connectivity.'],
      });
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const liveAuth = auth?.source === 'frappe';
  const effectiveRole = useMemo<ValidationRole | null>(() => {
    if (!liveAuth) return previewRole;
    if (auth?.role === 'inventory' || auth?.role === 'admin') return auth.role;
    return null;
  }, [auth, liveAuth, previewRole]);

  const actorName = liveAuth
    ? auth?.fullName || auth?.user || ''
    : previewActor;

  async function perform(action: ValidationAction) {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch('/api/inventory/reconciliation/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          sessionName,
          currentStatus: status,
          actorRole: effectiveRole ?? previewRole,
          actorName,
          remarks,
          blockingExceptions,
        }),
      });
      const payload = await response.json() as ApiResponse;
      setResult(payload);
      if (payload.ok) {
        setStatus(payload.nextStatus);
        setRemarks('');
        if (payload.persisted) await loadContext();
      }
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

  const inventoryPassed = status === 'INVENTORY_VALIDATED' || status === 'ADMIN_APPROVED';
  const adminPassed = status === 'ADMIN_APPROVED';
  const canInventory = effectiveRole === 'inventory';
  const canAdmin = effectiveRole === 'admin';

  return (
    <main className="workflow-page">
      <header className="scan-header">
        <div>
          <Link className="back-link" href="/inventory/reconciliation">← Reconciliation</Link>
          <p className="eyebrow">Dual validation · Inventory + Admin</p>
          <h1>Inventory Validation</h1>
          <p className="lead">Physical inventory is submitted and validated by an Inventory user first, then approved by a separate Admin user. Blocking exceptions stop both approval stages.</p>
        </div>
        <span className={liveAuth ? 'preview-badge live-badge' : 'preview-badge'}>
          {liveAuth ? 'Frappe identity' : 'Preview workflow'}
        </span>
      </header>

      {loading && <section className="panel">Loading validation context…</section>}

      {!loading && liveAuth && !auth?.authenticated && (
        <section className="lookup-warning" style={{ marginBottom: 16 }}>
          Sign in with a FacilityOS/Frappe user before validating inventory.{' '}
          <Link className="mis-link" href="/login">Sign in →</Link>
        </section>
      )}

      <section className="stats-grid">
        <article className="stat-card"><span>Current Status</span><strong style={{fontSize: 16}}>{status}</strong></article>
        <article className="stat-card"><span>Inventory Stage</span><strong style={{fontSize: 18}}>{inventoryPassed ? 'Passed' : status === 'SUBMITTED' ? 'Pending' : '—'}</strong></article>
        <article className="stat-card"><span>Admin Stage</span><strong style={{fontSize: 18}}>{adminPassed ? 'Passed' : status === 'INVENTORY_VALIDATED' ? 'Pending' : '—'}</strong></article>
        <article className="stat-card"><span>Opening Stock</span><strong style={{fontSize: 18}}>{status === 'ADMIN_APPROVED' && blockingExceptions === 0 ? 'Eligible' : 'Blocked'}</strong></article>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-heading">
          <div><p className="eyebrow">Operator</p><h2>Validation identity</h2></div>
          <span className="status">{sessionName || 'No session'}</span>
        </div>

        {liveAuth ? (
          <dl className="result-fields">
            <div><dt>Signed-in user</dt><dd>{actorName || 'Not signed in'}</dd></div>
            <div><dt>FacilityOS role</dt><dd>{auth?.role ?? 'unknown'}</dd></div>
            <div><dt>Identity source</dt><dd>Frappe server session</dd></div>
            <div><dt>Blocking exceptions</dt><dd>{blockingExceptions}</dd></div>
          </dl>
        ) : (
          <div className="workflow-grid">
            <label>
              <span>Acting role</span>
              <select value={previewRole} onChange={(event) => setPreviewRole(event.target.value as ValidationRole)}>
                <option value="inventory">Inventory Person</option>
                <option value="admin">Admin</option>
              </select>
              <small>Preview only. Production derives this from the signed-in Frappe user.</small>
            </label>
            <label>
              <span>Person</span>
              <input value={previewActor} onChange={(event) => setPreviewActor(event.target.value)} placeholder="Name / user ID" />
            </label>
            <label>
              <span>Blocking exceptions</span>
              <input type="number" min={0} value={blockingExceptions} onChange={(event) => setBlockingExceptions(Number(event.target.value))} />
            </label>
          </div>
        )}

        <label style={{ display: 'block', marginTop: 16 }}>
          <span>Remarks</span>
          <input value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Required when rejecting; optional for approval" />
        </label>
      </section>

      {status === 'DRAFT' && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <p className="eyebrow">Stage 0</p>
          <h2>Submit Count for Validation</h2>
          <p className="lead">The Inventory person submits the completed count session into the controlled validation workflow.</p>
          <button className="primary-button" type="button" disabled={busy || !canInventory || (liveAuth && !auth?.authenticated)} onClick={() => void perform('submit')}>
            Submit for Validation
          </button>
        </section>
      )}

      <section className="content-grid" style={{ marginBottom: 16 }}>
        <article className="panel">
          <p className="eyebrow">Stage 1</p>
          <h2>Inventory Person Validation</h2>
          <p className="lead">Verify physical quantity, serial/batch identity, condition, position/container placement, attached/WIP quantity and all reconciliation exceptions.</p>
          <div className="workflow-actions">
            <button className="primary-button" type="button" disabled={busy || !canInventory || status !== 'SUBMITTED' || blockingExceptions > 0} onClick={() => void perform('inventory_validate')}>
              Validate Inventory
            </button>
            <button className="action" type="button" disabled={busy || !canInventory || status !== 'SUBMITTED'} onClick={() => void perform('inventory_reject')}>
              Return for Correction
            </button>
          </div>
        </article>

        <article className="panel">
          <p className="eyebrow">Stage 2</p>
          <h2>Admin Approval</h2>
          <p className="lead">A different Admin user reviews the Inventory-validated reconciliation, evidence and exceptions before opening stock becomes eligible for the separate posting-approval step.</p>
          <div className="workflow-actions">
            <button className="primary-button" type="button" disabled={busy || !canAdmin || status !== 'INVENTORY_VALIDATED' || blockingExceptions > 0} onClick={() => void perform('admin_approve')}>
              Approve as Admin
            </button>
            <button className="action" type="button" disabled={busy || !canAdmin || status !== 'INVENTORY_VALIDATED'} onClick={() => void perform('admin_reject')}>
              Reject to Inventory
            </button>
          </div>
        </article>
      </section>

      {(status === 'INVENTORY_REJECTED' || status === 'ADMIN_REJECTED') && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-heading"><div><p className="eyebrow">Correction</p><h2>Reopen Validation</h2></div></div>
          <button className="primary-button" type="button" disabled={busy || !canInventory} onClick={() => void perform('reopen')}>
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
            <div><dt>Persisted</dt><dd>{result.persisted ? 'Yes — FacilityOS audit record' : 'No — preview only'}</dd></div>
            {result.actor && <div><dt>Actor</dt><dd>{result.actor}</dd></div>}
          </dl>
          {result.note && <div className="preview-note" style={{ marginTop: 12 }}>{result.note}</div>}
        </section>
      )}

      <section className="scan-note">
        <strong>Segregation of duties:</strong> production Admin approval is performed using the signed-in Frappe identity, and the same user who performed Inventory validation cannot approve the same count session as Admin. Admin approval still does not post opening stock.
      </section>
    </main>
  );
}
