import Link from 'next/link';

const workCells = [
  { code: 'SFG-CTR-01', name: 'Centre Assembly', status: 'Route card' },
  { code: 'SFG-ARM-01', name: 'Motor Arm Assembly', status: 'Genealogy' },
  { code: 'SFG-LGT-01', name: 'Landing Gear Assembly', status: 'Build' },
  { code: 'SFG-LWR-01', name: 'Lower Assembly', status: 'Build' },
  { code: 'SFG-FRM-01', name: 'Frame Assembly', status: 'Final assembly' },
];

export default function ShopfloorWorkspace() {
  return (
    <main className="workflow-page role-workspace">
      <header className="role-hero role-hero-shopfloor">
        <div>
          <Link className="back-link role-back" href="/roles">← Role Workspaces</Link>
          <p className="eyebrow">Shopfloor</p>
          <h1>Assembly & Genealogy</h1>
          <p className="lead">Build SFGs, scan components, capture install/remove/replace events and keep each assembly route card traceable from component to finished drone.</p>
        </div>
        <div className="role-identity-card">
          <span>Role</span><strong>Shopfloor</strong><small>Genealogy & route-card access</small>
        </div>
      </header>

      <section className="role-kpi-grid">
        <article className="role-kpi"><span>Work Queue</span><strong>Build</strong><small>Start from SFG route card</small></article>
        <article className="role-kpi"><span>Component Scan</span><strong>Required</strong><small>Identity before installation</small></article>
        <article className="role-kpi"><span>Genealogy</span><strong>Immutable</strong><small>Install / remove / replace history</small></article>
        <article className="role-kpi"><span>Stock Posting</span><strong>Not here</strong><small>Inventory controls ERP movement</small></article>
      </section>

      <section className="panel" id="build">
        <div className="panel-heading">
          <div><p className="eyebrow">Production Flow</p><h2>Build an assembly</h2></div>
          <Link className="scan-primary scan-link" href="/inventory/scan">▣ Scan Component / SFG</Link>
        </div>
        <div className="shopfloor-flow">
          <div><span>01</span><strong>Scan SFG sticker</strong><small>Identify the assembly route card</small></div>
          <b>→</b>
          <div><span>02</span><strong>Scan components</strong><small>Validate expected item/serial</small></div>
          <b>→</b>
          <div><span>03</span><strong>Install / build</strong><small>Create BUILT_FROM / INSTALLED_IN event</small></div>
          <b>→</b>
          <div><span>04</span><strong>Complete stage</strong><small>Record operator, time and result</small></div>
        </div>
      </section>

      <div className="role-two-column">
        <section className="panel" id="route-cards">
          <div className="panel-heading"><div><p className="eyebrow">Route Cards</p><h2>SFG work centres</h2></div><span className="status">Scan-first</span></div>
          <div className="sfg-grid">
            {workCells.map((cell) => (
              <article key={cell.code}>
                <span>{cell.code}</span><strong>{cell.name}</strong><small>{cell.status}</small>
                <Link href={'/inventory/scan?value=' + encodeURIComponent(cell.code + '-S0001')}>Open sample →</Link>
              </article>
            ))}
          </div>
        </section>

        <section className="panel" id="genealogy">
          <div className="panel-heading"><div><p className="eyebrow">Genealogy</p><h2>Allowed events</h2></div></div>
          <div className="genealogy-list">
            <div><b>BUILT_FROM</b><span>SFG ← components</span></div>
            <div><b>INSTALLED_IN</b><span>component/SFG → parent</span></div>
            <div><b>REMOVED_FROM</b><span>preserve removal history</span></div>
            <div><b>REPLACED_BY</b><span>old identity → new identity</span></div>
          </div>
          <div className="lookup-warning" style={{marginTop: 14}}>A missing component label becomes a traceability exception. Shopfloor should never create a replacement serial simply to complete an assembly.</div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Operator Actions</p><h2>Common shopfloor jobs</h2></div></div>
        <div className="role-action-grid">
          <Link className="role-action role-action-primary" href="/inventory/scan"><strong>Scan & Resolve</strong><span>Serial / SFG / Drone</span><b>→</b></Link>
          <a className="role-action" href="#build"><strong>Build SFG</strong><span>Create component genealogy</span><b>→</b></a>
          <a className="role-action" href="#genealogy"><strong>Install Component</strong><span>Record parent-child identity</span><b>→</b></a>
          <a className="role-action" href="#genealogy"><strong>Replace Component</strong><span>Preserve old + new history</span><b>→</b></a>
        </div>
      </section>
    </main>
  );
}
