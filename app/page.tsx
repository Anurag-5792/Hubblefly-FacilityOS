const stats = [
  ['Items in Store', '179'],
  ['Open Exceptions', '12'],
  ['Moves Today', '38'],
  ['Pending Counts', '24']
];

const inventoryActions = [
  ['Scan QR', '/inventory/scan'],
  ['Receive', '/inventory/transaction?kind=receive'],
  ['Move', '/inventory/move'],
  ['Issue', '/inventory/transaction?kind=issue'],
  ['Return', '/inventory/transaction?kind=return'],
  ['Physical Count', '/inventory/count']
];
const shopfloorActions = ['Build SFG', 'Install Component', 'Replace Component', 'Route Card'];

export default function HomePage() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">HUBBLEFLY <span>FacilityOS</span></div>
        <nav>
          <a className="active" href="/">Dashboard</a>
          <a href="/inventory">Inventory</a>
          <a href="/shopfloor">Shopfloor</a>
          <a href="/inventory/traceability">Traceability</a>
          <a href="/mis">MIS & Analytics</a>
          <a>Documents</a>
          <a href="/admin">Admin</a>
        </nav>
        <div className="sidebar-footer">ERPNext: <strong>Server adapter ready</strong></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Hubblefly Technologies Limited</p>
            <h1>Operations Dashboard</h1>
          </div>
          <div className="workflow-actions"><a className="action action-link" href="/roles">Role Workspaces</a><a className="scan-primary scan-link" href="/inventory/scan">▣ Scan QR</a></div>
        </header>

        <div className="stats-grid">
          {stats.map(([label, value]) => (
            <article className="stat-card" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>

        <div className="content-grid">
          <article className="panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Inventory</p><h2>Store Operations</h2></div>
              <a className="status" href="/inventory">Open Inventory</a>
            </div>
            <div className="action-grid">
              {inventoryActions.map(([action, href], index) => (
                <a className={index === 0 ? 'action action-featured action-link' : 'action action-link'} href={href} key={action}>{action}</a>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Shopfloor</p><h2>Assembly & Genealogy</h2></div>
              <a className="status" href="/shopfloor">Open Shopfloor</a>
            </div>
            <div className="action-grid">
              {shopfloorActions.map(action => <a className="action action-link" href="/shopfloor" key={action}>{action}</a>)}
            </div>
          </article>

          <article className="panel mis-teaser">
            <div className="panel-heading">
              <div><p className="eyebrow">MIS</p><h2>Build your view</h2></div>
              <span className="status">Read-only analytics</span>
            </div>
            <p>Select period, company, warehouse, item group, transaction type and metric. FacilityOS will populate KPIs, tables and graphs from ERPNext-backed data.</p>
            <a className="mis-link" href="/mis">Open MIS Dashboard →</a>
          </article>

          <article className="panel qr-panel">
            <p className="eyebrow">Universal Resolver</p>
            <h2>Scan anything</h2>
            <p>Serial, batch, position, bin, box, SFG or drone QR. FacilityOS resolves the object and shows only valid actions for the signed-in role.</p>
            <a className="qr-placeholder" href="/inventory/scan">QR</a>
            <code>R03-L2-P04</code>
          </article>

          <article className="panel activity-panel">
            <p className="eyebrow">Recent activity</p>
            <h2>Audit trail</h2>
            <div className="activity-row"><b>MOVE</b><span>PSY-MTR-03-S0042</span><small>R03-L2-P04-S2</small></div>
            <div className="activity-row"><b>COUNT</b><span>PWR-BAT-01-B003</span><small>BB-014</small></div>
            <div className="activity-row"><b>INSTALL</b><span>SFG-ARM-01-S0017</span><small>Component genealogy</small></div>
          </article>
        </div>
      </section>

      <nav className="mobile-nav">
        <a href="/">Home</a><a href="/inventory">Inventory</a><a className="mobile-scan" href="/inventory/scan">Scan</a><a href="/mis">MIS</a><a>More</a>
      </nav>
    </main>
  );
}
