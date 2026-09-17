const stats = [
  ['Items in Store', '179'],
  ['Open Exceptions', '12'],
  ['Moves Today', '38'],
  ['Pending Counts', '24']
];

const inventoryActions = ['Scan QR', 'Receive', 'Move', 'Issue', 'Return', 'Physical Count'];
const shopfloorActions = ['Build SFG', 'Install Component', 'Replace Component', 'Route Card'];

export default function HomePage() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">HUBBLEFLY <span>FacilityOS</span></div>
        <nav>
          <a className="active">Dashboard</a>
          <a>Inventory</a>
          <a>Shopfloor</a>
          <a>Traceability</a>
          <a>Documents</a>
          <a>Admin</a>
        </nav>
        <div className="sidebar-footer">ERPNext: <strong>Not configured</strong></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Hubblefly Technologies Limited</p>
            <h1>Operations Dashboard</h1>
          </div>
          <button className="scan-primary">▣ Scan QR</button>
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
              <span className="status">HFT Store</span>
            </div>
            <div className="action-grid">
              {inventoryActions.map((action, index) => (
                <button className={index === 0 ? 'action action-featured' : 'action'} key={action}>{action}</button>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Shopfloor</p><h2>Assembly & Genealogy</h2></div>
              <span className="status">SFG Traceability</span>
            </div>
            <div className="action-grid">
              {shopfloorActions.map(action => <button className="action" key={action}>{action}</button>)}
            </div>
          </article>

          <article className="panel qr-panel">
            <p className="eyebrow">Universal Resolver</p>
            <h2>Scan anything</h2>
            <p>Serial, batch, position, bin, box, SFG or drone QR. FacilityOS resolves the object and shows only valid actions for the signed-in role.</p>
            <div className="qr-placeholder">QR</div>
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
        <a>Home</a><a>Inventory</a><button>Scan</button><a>Shopfloor</a><a>More</a>
      </nav>
    </main>
  );
}
