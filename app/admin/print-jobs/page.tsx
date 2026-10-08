'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type PrintJob = {
  jobId: string;
  labelKind: string;
  itemCode?: string | null;
  explicitPrintQty: number;
  approvedQty: number;
  status: string;
  createdBy?: string | null;
  modified?: string | null;
};

type ListResponse = {
  ok: boolean;
  source: 'sample' | 'facilityos';
  jobs: PrintJob[];
  error?: string;
};

type ApproveResponse = {
  ok: boolean;
  persisted: boolean;
  jobId?: string;
  status?: string;
  note?: string;
  error?: string;
};

export default function AdminPrintJobsPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/labels/jobs', { cache: 'no-store' });
    const payload = await response.json() as ListResponse;
    setData(payload);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function approve(jobId: string) {
    setBusyId(jobId);
    setMessage('');
    try {
      const response = await fetch('/api/labels/jobs/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      const payload = await response.json() as ApproveResponse;
      if (!payload.ok) {
        setMessage(payload.error ?? 'Print job could not be approved.');
      } else {
        setMessage(payload.persisted
          ? jobId + ' approved.'
          : jobId + ' preview approval passed; nothing was persisted.');
        if (payload.persisted) {
          await load();
        } else {
          setData((current) => current ? {
            ...current,
            jobs: current.jobs.map((job) => job.jobId === jobId
              ? { ...job, status: 'Approved', approvedQty: job.explicitPrintQty }
              : job),
          } : current);
        }
      }
    } catch {
      setMessage('Print job could not be approved.');
    } finally {
      setBusyId('');
    }
  }

  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];

  return (
    <main className="workflow-page role-workspace">
      <header className="role-hero role-hero-admin">
        <div>
          <Link className="back-link role-back" href="/admin">← Admin Workspace</Link>
          <p className="eyebrow">Admin · Printing</p>
          <h1>Print Approval Queue</h1>
          <p className="lead">Review the exact requested label quantity before allowing production printing. Approval never changes stock.</p>
        </div>
        <div className="role-identity-card">
          <span>Control</span><strong>Admin Approval</strong><small>Previewed → Approved → Printed</small>
        </div>
      </header>

      {data?.error && <div className="lookup-warning" style={{ marginBottom: 16 }}>{data.error}</div>}
      {message && <div className="preview-note" style={{ marginBottom: 16 }}>{message}</div>}

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Queue</p><h2>Print jobs</h2></div>
          <span className={data?.source === 'facilityos' ? 'preview-badge live-badge' : 'preview-badge'}>
            {data?.source === 'facilityos' ? 'Live FacilityOS' : 'Preview queue'}
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Job</th><th>Type</th><th>Item</th><th>Requested</th><th>Approved</th><th>Status</th><th>Created By</th><th></th></tr></thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr><td colSpan={8} style={{ color: 'var(--muted)' }}>No print jobs found.</td></tr>
              ) : jobs.map((job) => (
                <tr key={job.jobId}>
                  <td><strong>{job.jobId}</strong></td>
                  <td>{job.labelKind}</td>
                  <td>{job.itemCode ?? '—'}</td>
                  <td>{job.explicitPrintQty}</td>
                  <td>{job.approvedQty}</td>
                  <td><span className={job.status === 'Approved' || job.status === 'Printed' ? 'preview-badge live-badge' : 'preview-badge'}>{job.status}</span></td>
                  <td>{job.createdBy ?? '—'}</td>
                  <td>
                    {job.status === 'Previewed' || job.status === 'Draft' ? (
                      <button className="scan-primary" type="button" disabled={busyId === job.jobId} onClick={() => void approve(job.jobId)}>
                        {busyId === job.jobId ? 'Approving…' : 'Approve ' + job.explicitPrintQty}
                      </button>
                    ) : <span className="status">{job.status}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="role-rule-strip">
        <strong>Approval rule:</strong> Admin approves the exact quantity shown. If the print quantity changes, create a new preview/job instead of silently increasing the approved batch.
      </section>
    </main>
  );
}
