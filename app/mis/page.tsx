"use client";

import { useEffect, useMemo, useState } from "react";
import type { MisFilters, MisQueryResponse, MisRow } from "../../lib/mis/types";

const initialFilters: MisFilters = {
  period: "Today",
  company: "Hubblefly Technologies Limited",
  warehouse: "HFT Store",
  module: "Inventory",
  metric: "Stock Qty",
  groupBy: "Item Group"
};

export default function MISPage() {
  const [filters, setFilters] = useState<MisFilters>(initialFilters);
  const [data, setData] = useState<MisQueryResponse>({
    ok: true,
    source: "sample",
    lastSyncedAt: null,
    rows: [],
    total: 0
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function runReport(nextFilters: MisFilters = filters) {
    setBusy(true);
    setError("");

    const params = new URLSearchParams({
      period: nextFilters.period,
      company: nextFilters.company,
      warehouse: nextFilters.warehouse,
      module: nextFilters.module,
      metric: nextFilters.metric,
      groupBy: nextFilters.groupBy
    });

    try {
      const response = await fetch(`/api/mis/query?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as MisQueryResponse;
      setData(payload);
      if (!payload.ok) setError(payload.error ?? "MIS query failed.");
    } catch {
      setError("MIS query could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void runReport(initialFilters);
  }, []);

  const max = useMemo(
    () => Math.max(...data.rows.map((row: MisRow) => row.displayed), 1),
    [data.rows]
  );

  const update = (key: keyof MisFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">HUBBLEFLY <span>FacilityOS</span></div>
        <nav>
          <a href="/">Dashboard</a>
          <a href="/inventory">Inventory</a>
          <a href="/shopfloor">Shopfloor</a>
          <a href="/inventory/traceability">Traceability</a>
          <a className="active" href="/mis">MIS & Analytics</a>
          <a>Documents</a>
          <a href="/admin">Admin</a>
        </nav>
        <div className="sidebar-footer">
          MIS source
          <strong>{data.source === "facilityos-read-model" ? "FacilityOS DB" : "Sample read model"}</strong>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Management Information System</p>
            <h1>Select your requirements</h1>
          </div>
          <div className="workflow-actions"><a className="action action-link" href="/roles">Role Workspaces</a><button className="primary-button" onClick={() => void runReport()} disabled={busy}>
            {busy ? "Running…" : "Run Report"}
          </button></div>
        </header>

        <div className="preview-note">
          {data.source === "sample"
            ? "Sample mode: the screen is querying the FacilityOS MIS endpoint using synthetic data. Production MIS will query FacilityOS read-model tables on the existing Frappe site, not repeatedly hit ERPNext APIs."
            : `FacilityOS read model · Last synced ${data.lastSyncedAt ?? "unknown"}`}
        </div>

        {error && <div className="lookup-warning" style={{ marginBottom: 16 }}>{error}</div>}

        <section className="panel filter-bar">
          <div className="filter-field"><label>Period</label><select value={filters.period} onChange={e => update("period", e.target.value)}><option>Today</option><option>7 Days</option><option>30 Days</option><option>Custom</option></select></div>
          <div className="filter-field"><label>Company</label><select value={filters.company} onChange={e => update("company", e.target.value)}><option>Hubblefly Technologies Limited</option><option>Drone Destination Limited</option><option>Agristar Technologies Pvt. Ltd.</option><option>Hubblefly Batteries Pvt. Ltd.</option></select></div>
          <div className="filter-field"><label>Warehouse</label><select value={filters.warehouse} onChange={e => update("warehouse", e.target.value)}><option>HFT Store</option><option>All Warehouses</option></select></div>
          <div className="filter-field"><label>Module</label><select value={filters.module} onChange={e => update("module", e.target.value)}><option>Inventory</option><option>Shopfloor</option><option>Traceability</option><option>Documents</option></select></div>
          <div className="filter-field"><label>Metric</label><select value={filters.metric} onChange={e => update("metric", e.target.value)}><option>Stock Qty</option><option>Moves</option><option>Exceptions</option></select></div>
          <div className="filter-field"><label>Group By</label><select value={filters.groupBy} onChange={e => update("groupBy", e.target.value)}><option>Item Group</option><option>Warehouse</option><option>Transaction Type</option><option>Operator</option></select></div>
        </section>

        <div className="stats-grid">
          <article className="stat-card"><span>Selected metric total</span><strong>{data.total.toLocaleString()}</strong></article>
          <article className="stat-card"><span>Rows returned</span><strong>{data.rows.length}</strong></article>
          <article className="stat-card"><span>Source</span><strong style={{fontSize: 16}}>{data.source === "sample" ? "Sample" : "FacilityOS DB"}</strong></article>
          <article className="stat-card"><span>Period</span><strong style={{fontSize: 20}}>{filters.period}</strong></article>
        </div>

        <div className="mis-grid">
          <article className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Graph</p><h2>{filters.metric} by {filters.groupBy}</h2></div><span className="status">FacilityOS query</span></div>
            <div className="chart-shell">
              {data.rows.map(row => <div key={row.label} className="chart-bar" style={{height: `${Math.max(8, Math.round((row.displayed / max) * 220))}px`}} title={`${row.label}: ${row.displayed}`}><span>{row.label}</span></div>)}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Figures</p><h2>Current selection</h2></div></div>
            <p><strong>Module:</strong> {filters.module}</p>
            <p><strong>Warehouse:</strong> {filters.warehouse}</p>
            <p><strong>Metric:</strong> {filters.metric}</p>
            <p><strong>Group:</strong> {filters.groupBy}</p>
            <p><strong>Last synced:</strong> {data.lastSyncedAt ?? (data.source === "sample" ? "Sample mode" : "Unknown")}</p>
          </article>
        </div>

        <article className="panel" style={{marginTop: 16}}>
          <div className="panel-heading"><div><p className="eyebrow">Table</p><h2>Detailed result</h2></div><span className="status">Read-only</span></div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>{filters.groupBy}</th><th>Stock Qty</th><th>Moves</th><th>Exceptions</th><th>Selected Metric</th></tr></thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr><td colSpan={5} style={{ color: "var(--muted)" }}>{busy ? "Running report…" : "No rows returned."}</td></tr>
                ) : data.rows.map(row => <tr key={row.label}><td>{row.label}</td><td>{row.stock}</td><td>{row.moves}</td><td>{row.exceptions}</td><td><strong>{row.displayed}</strong></td></tr>)}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <nav className="mobile-nav"><a href="/">Home</a><a href="/inventory">Inventory</a><a className="mobile-scan" href="/inventory/scan">Scan</a><a href="/mis">MIS</a><a>More</a></nav>
    </main>
  );
}
