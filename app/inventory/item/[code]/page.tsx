'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type ItemDetail = {
  name: string;
  item_name?: string;
  item_group?: string;
  stock_uom?: string;
  brand?: string;
  has_serial_no?: number;
  has_batch_no?: number;
  disabled?: number;
};

type StockRow = {
  warehouse?: string;
  actual_qty?: number;
  reserved_qty?: number;
  projected_qty?: number;
};

type LedgerRow = {
  posting_date?: string;
  posting_time?: string;
  voucher_type?: string;
  voucher_no?: string;
  warehouse?: string;
  actual_qty?: number;
  qty_after_transaction?: number;
  batch_no?: string;
  serial_no?: string;
  company?: string;
};

type DetailResponse = {
  ok: boolean;
  source?: 'erpnext' | 'preview';
  item?: ItemDetail;
  stock?: StockRow[];
  ledger?: LedgerRow[];
  error?: string;
  note?: string;
};

export default function ItemDetailPage() {
  const params = useParams<{ code: string }>();
  const code = useMemo(() => decodeURIComponent(params.code ?? ''), [params.code]);
  const [data, setData] = useState<DetailResponse | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let active = true;
    setBusy(true);
    fetch(`/api/inventory/item?code=${encodeURIComponent(code)}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload: DetailResponse) => { if (active) setData(payload); })
      .catch(() => { if (active) setData({ ok: false, error: 'Item detail could not be loaded.' }); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [code]);

  const item = data?.item;
  const stockTotal = (data?.stock ?? []).reduce((sum, row) => sum + Number(row.actual_qty ?? 0), 0);

  return (
    <main className="workflow-page">
      <header className="scan-header">
        <div>
          <Link className="back-link" href="/inventory">← Inventory</Link>
          <p className="eyebrow">Item detail</p>
          <h1>{item?.item_name || code}</h1>
          <p className="lead">{code}</p>
        </div>
        <span className={data?.source === 'erpnext' ? 'preview-badge live-badge' : 'preview-badge'}>
          {data?.source === 'erpnext' ? 'Live ERPNext' : 'Preview data'}
        </span>
      </header>

      {busy && <section className="panel">Loading item detail…</section>}
      {!busy && data?.error && <section className="panel workflow-result error">{data.error}</section>}

      {!busy && item && (
        <>
          <section className="stats-grid">
            <article className="stat-card"><span>Total stock</span><strong>{stockTotal}</strong></article>
            <article className="stat-card"><span>Control</span><strong>{item.has_serial_no ? 'Serial' : item.has_batch_no ? 'Batch' : 'Standard'}</strong></article>
            <article className="stat-card"><span>UOM</span><strong>{item.stock_uom || '—'}</strong></article>
            <article className="stat-card"><span>Status</span><strong>{item.disabled ? 'Disabled' : 'Active'}</strong></article>
          </section>

          <section className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-heading">
              <div><p className="eyebrow">Master data</p><h2>Item information</h2></div>
            </div>
            <dl className="result-fields">
              <div><dt>Item Code</dt><dd>{item.name}</dd></div>
              <div><dt>Item Name</dt><dd>{item.item_name || '—'}</dd></div>
              <div><dt>Item Group</dt><dd>{item.item_group || '—'}</dd></div>
              <div><dt>Brand</dt><dd>{item.brand || '—'}</dd></div>
              <div><dt>Stock UOM</dt><dd>{item.stock_uom || '—'}</dd></div>
            </dl>
          </section>

          <section className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-heading">
              <div><p className="eyebrow">Stock</p><h2>Warehouse balance</h2></div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Warehouse</th><th>Actual</th><th>Reserved</th><th>Projected</th></tr></thead>
                <tbody>
                  {(data.stock ?? []).map((row, index) => (
                    <tr key={`${row.warehouse}-${index}`}>
                      <td>{row.warehouse || '—'}</td>
                      <td>{row.actual_qty ?? 0}</td>
                      <td>{row.reserved_qty ?? 0}</td>
                      <td>{row.projected_qty ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div><p className="eyebrow">History</p><h2>Recent stock movements</h2></div>
              <span className="status">Latest 50</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Date</th><th>Voucher</th><th>Warehouse</th><th>Change</th><th>Balance</th><th>Batch / Serial</th></tr></thead>
                <tbody>
                  {(data.ledger ?? []).length === 0 ? (
                    <tr><td colSpan={6} style={{ color: 'var(--muted)' }}>No movements found.</td></tr>
                  ) : (data.ledger ?? []).map((row, index) => (
                    <tr key={`${row.voucher_no}-${index}`}>
                      <td>{row.posting_date || '—'} {row.posting_time || ''}</td>
                      <td><strong>{row.voucher_type || '—'}</strong><br/><small>{row.voucher_no || '—'}</small></td>
                      <td>{row.warehouse || '—'}</td>
                      <td>{row.actual_qty ?? 0}</td>
                      <td>{row.qty_after_transaction ?? 0}</td>
                      <td>{row.batch_no || row.serial_no || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="workflow-actions" style={{ marginTop: 16 }}>
            <Link className="action action-featured action-link" href={`/inventory/scan?value=${encodeURIComponent(code)}`}>Scan / Resolve</Link>
            <Link className="action action-link" href={`/inventory/move?source=${encodeURIComponent(code)}`}>Move</Link>
            <Link className="action action-link" href={`/inventory/count?target=${encodeURIComponent(code)}`}>Physical Count</Link>
          </section>
        </>
      )}
    </main>
  );
}
