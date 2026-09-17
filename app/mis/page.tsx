"use client";

import { useMemo, useState } from "react";

type FilterState = {
  period: string;
  company: string;
  warehouse: string;
  module: string;
  metric: string;
  groupBy: string;
};

const baseRows = [
  { label: "Batteries", stock: 1459, moves: 18, exceptions: 2 },
  { label: "Motors", stock: 328, moves: 11, exceptions: 1 },
  { label: "Propellers", stock: 412, moves: 7, exceptions: 4 },
  { label: "Tanks", stock: 198, moves: 3, exceptions: 0 },
  { label: "Nozzles", stock: 552, moves: 9, exceptions: 3 }
];

export default function MISPage() {
  const [filters, setFilters] = useState<FilterState>({
    period: "Today",
    company: "Hubblefly Technologies Limited",
    warehouse: "HFT Store",
    module: "Inventory",
    metric: "Stock Qty",
    groupBy: "Item Group"
  });

  const rows = useMemo(() => {
    const multiplier = filters.period === "Today" ? 1 : filters.period === "7 Days" ? 1.12 : 1.25;
    return baseRows.map(row => ({
      ...row,
      displayed: filters.metric === "Moves" ? row.moves : filters.metric === "Exceptions" ? row.exceptions : Math.round(row.stock * multiplier)
    }));
  }, [filters]);

  const total = rows.reduce((sum, row) => sum + row.displayed, 0);
  const max = Math.max(...rows.map(row => row.displayed), 1);

  const update = (key: keyof FilterState, value: string) => setFilters(current => ({ ...current, [key]: value }));

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">HUBBLEFLY <span>FacilityOS</span></div>
        <nav>
          <a href="/">Dashboard</a>
          <a>Inventory</a>
          <a>Shopfloor</a>
          <a>Traceability</a>
          <a className="active" href="/mis">MIS & Analytics</a>
          <a>Documents</a>
          <a>Admin</a>
        </nav>
        <div className="sidebar-footer">MIS access <strong>Read-only analytics</strong></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Management Information System</p>
            <h1>Select your requirements</h1>
          </div>
          <button className="primary-button">Save View</button>
        </header>

        <div className="preview-note">Preview data only until ERPNext reporting APIs are connected. The final dashboard will populate from authorized live ERPNext and FacilityOS data.</div>

        <section className="panel filter-bar">
          <div className="filter-field"><label>Period</label><select value={filters.period} onChange={e => update("period", e.target.value)}><option>Today</option><option>7 Days</option><option>30 Days</option><option>Custom</option></select></div>
          <div className="filter-field"><label>Company</label><select value={filters.company} onChange={e => update("company", e.target.value)}><option>Hubblefly Technologies Limited</option><option>Drone Destination Limited</option><option>Agristar Technologies Pvt. Ltd.</option><option>Hubblefly Batteries Pvt. Ltd.</option></select></div>
          <div className="filter-field"><label>Warehouse</label><select value={filters.warehouse} onChange={e => update("warehouse", e.target.value)}><option>HFT Store</option><option>All Warehouses</option></select></div>
          <div className="filter-field"><label>Module</label><select value={filters.module} onChange={e => update("module", e.target.value)}><option>Inventory</option><option>Shopfloor</option><option>Traceability</option><option>Documents</option></select></div>
          <div className="filter-field"><label>Metric</label><select value={filters.metric} onChange={e => update("metric", e.target.value)}><option>Stock Qty</option><option>Moves</option><option>Exceptions</option></select></div>
          <div className="filter-field"><label>Group By</label><select value={filters.groupBy} onChange={e => update("groupBy", e.target.value)}><option>Item Group</option><option>Warehouse</option><option>Transaction Type</option><option>Operator</option></select></div>
        </section>

        <div className="stats-grid">
          <article className="stat-card"><span>Selected metric total</span><strong>{total.toLocaleString()}</strong></article>
          <article className="stat-card"><span>Rows returned</span><strong>{rows.length}</strong></article>
          <article className="stat-card"><span>Company</span><strong style={{fontSize: 16}}>{filters.company}</strong></article>
          <article className="stat-card"><span>Period</span><strong style={{fontSize: 20}}>{filters.period}</strong></article>
        </div>

        <div className="mis-grid">
          <article className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Graph</p><h2>{filters.metric} by {filters.groupBy}</h2></div><span className="status">Dynamic</span></div>
            <div className="chart-shell">
              {rows.map(row => <div key={row.label} className="chart-bar" style={{height: `${Math.max(8, Math.round((row.displayed / max) * 220))}px`}} title={`${row.label}: ${row.displayed}`}><span>{row.label}</span></div>)}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Figures</p><h2>Current selection</h2></div></div>
            <p><strong>Module:</strong> {filters.module}</p>
            <p><strong>Warehouse:</strong> {filters.warehouse}</p>
            <p><strong>Metric:</strong> {filters.metric}</p>
            <p><strong>Group:</strong> {filters.groupBy}</p>
          </article>
        </div>

        <article className="panel" style={{marginTop: 16}}>
          <div className="panel-heading"><div><p className="eyebrow">Table</p><h2>Detailed result</h2></div><span className="status">Export later</span></div>
          <table className="data-table">
            <thead><tr><th>{filters.groupBy}</th><th>Stock Qty</th><th>Moves</th><th>Exceptions</th><th>Selected Metric</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.label}><td>{row.label}</td><td>{row.stock}</td><td>{row.moves}</td><td>{row.exceptions}</td><td><strong>{row.displayed}</strong></td></tr>)}</tbody>
          </table>
        </article>
      </section>

      <nav className="mobile-nav"><a href="/">Home</a><a>Inventory</a><button>Scan</button><a href="/mis">MIS</a><a>More</a></nav>
    </main>
  );
}
