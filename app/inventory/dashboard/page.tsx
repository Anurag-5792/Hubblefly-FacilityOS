import Link from 'next/link';

const primary = [
  ['Scan QR', '/inventory/scan', 'Scan serial, batch, position, container or SFG'],
  ['Physical Count', '/inventory/count', 'Record physical truth without posting ERP stock'],
  ['Move', '/inventory/move', 'Move stock or FacilityOS containers'],
  ['Receive', '/inventory/transaction?kind=receive', 'Prepare inward transaction'],
  ['Issue', '/inventory/transaction?kind=issue', 'Prepare outward transaction'],
  ['Return', '/inventory/transaction?kind=return', 'Prepare return transaction'],
];

export default function InventoryRoleDashboard() {
  return (
    <main className="workflow-page role-workspace">
      <header className="role-hero role-hero-inventory">
        <div>
          <Link className="back-link role-back" href="/roles">← Role Workspaces</Link>
          <p className="eyebrow">Inventory Person</p>
          <h1>Store Operations</h1>
          <p className="lead">Everything needed for receiving, identification, location, physical count, reconciliation and Inventory validation — without exposing Admin controls.</p>
        </div>
        <div className="role-identity-card">
          <span>Role</span><strong>Inventory</strong><small>Operational write access · no Admin approval</small>
        </div>
      </header>

      <section className="role-kpi-grid">
        <article className="role-kpi"><span>Physical Count</span><strong>In progress</strong><small>Continue verified count sessions</small></article>
        <article className="role-kpi"><span>Traceability</span><strong>Needs review</strong><small>Missing labels / identity exceptions</small></article>
        <article className="role-kpi"><span>Validation</span><strong>Inventory stage</strong><small>Submit or validate after exceptions clear</small></article>
        <article className="role-kpi role-kpi-gate"><span>Opening Stock</span><strong>Blocked</strong><small>Admin approval + posting gate still required</small></article>
      </section>

      <section className="panel role-primary-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Daily Work</p><h2>Store actions</h2></div>
          <Link className="status" href="/inventory">Search Item Master</Link>
        </div>
        <div className="role-action-grid">
          {primary.map(([label, href, note], index) => (
            <Link className={index === 0 ? 'role-action role-action-primary' : 'role-action'} href={href} key={label}>
              <strong>{label}</strong><span>{note}</span><b>→</b>
            </Link>
          ))}
        </div>
      </section>

      <div className="role-two-column">
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Control Queue</p><h2>What needs attention</h2></div></div>
          <div className="role-task-list">
            <Link href="/inventory/reconciliation"><span className="role-task-priority">1</span><div><strong>Reconciliation</strong><small>Reference vs physical vs attached/WIP</small></div><b>→</b></Link>
            <Link href="/inventory/traceability"><span className="role-task-priority">2</span><div><strong>Traceability Exceptions</strong><small>Unused labels, missing stickers, identity gaps</small></div><b>→</b></Link>
            <Link href="/inventory/reconciliation/validation"><span className="role-task-priority">3</span><div><strong>Inventory Validation</strong><small>Validate only after blocking exceptions are resolved</small></div><b>→</b></Link>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Location Control</p><h2>Physical store</h2></div></div>
          <div className="role-mini-grid">
            <Link href="/inventory/scan?value=R03-L2-P04-S2"><strong>Position</strong><span>Rack → Level → Position → Slot</span></Link>
            <Link href="/inventory/scan?value=BN-014"><strong>Container</strong><span>BN / BX / BB identity & movement</span></Link>
            <Link href="/inventory/traceability"><strong>Labels</strong><span>Applied, unused, void, exception</span></Link>
            <Link href="/inventory/reconciliation"><strong>Count Session</strong><span>Physical truth + exception gate</span></Link>
          </div>
        </section>
      </div>

      <section className="role-rule-strip">
        <strong>Inventory rule:</strong> record what physically exists. Do not invent serials, infer missing stock from serial gaps, or post ERPNext stock until reconciliation and approvals are complete.
      </section>
    </main>
  );
}
