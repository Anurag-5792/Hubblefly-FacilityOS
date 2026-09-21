import Link from 'next/link';

export default function AdminWorkspace() {
  return (
    <main className="workflow-page role-workspace">
      <header className="role-hero role-hero-admin">
        <div>
          <Link className="back-link role-back" href="/roles">← Role Workspaces</Link>
          <p className="eyebrow">Administrator</p>
          <h1>Controls & Approvals</h1>
          <p className="lead">System health, validation approvals, user/role governance, read-model sync, master-data readiness and production release gates in one controlled view.</p>
        </div>
        <div className="role-identity-card">
          <span>Role</span><strong>Admin</strong><small>Approval + configuration authority</small>
        </div>
      </header>

      <section className="role-kpi-grid">
        <article className="role-kpi"><span>Approval Queue</span><strong>Review</strong><small>Only Inventory-validated sessions</small></article>
        <article className="role-kpi"><span>Backend</span><strong>Install gate</strong><small>Frappe app health and migrations</small></article>
        <article className="role-kpi"><span>Read Models</span><strong>Sync</strong><small>ERPNext → FacilityOS analytics</small></article>
        <article className="role-kpi role-kpi-gate"><span>ERP Writes</span><strong>Disabled</strong><small>Separate release decision required</small></article>
      </section>

      <div className="role-two-column">
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Approval Control</p><h2>Inventory validation</h2></div><span className="status">Segregation of duties</span></div>
          <div className="admin-stage-list">
            <div className="done"><span>1</span><div><strong>Physical Count</strong><small>Inventory records physical truth</small></div></div>
            <div className="done"><span>2</span><div><strong>Reconciliation</strong><small>Resolve blocking differences and identity issues</small></div></div>
            <div><span>3</span><div><strong>Inventory Validation</strong><small>Inventory Person validates</small></div></div>
            <div><span>4</span><div><strong>Admin Approval</strong><small>Different user reviews and approves</small></div></div>
            <div className="locked"><span>5</span><div><strong>Opening Stock Posting</strong><small>Separate future posting control</small></div></div>
          </div>
          <Link className="scan-primary scan-link" href="/inventory/reconciliation/validation">Open Approval Queue</Link>
        </section>

        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">System</p><h2>Health & integration</h2></div></div>
          <div className="role-mini-grid">
            <Link href="/admin/integrations"><strong>Connection Health</strong><span>ERPNext + FacilityOS backend</span></Link>
            <Link href="/admin/sync"><strong>Sync Status</strong><span>Read-model freshness and failures</span></Link>
            <Link href="/inventory/traceability"><strong>Traceability Gate</strong><span>Blocking identity exceptions</span></Link>
            <Link href="/mis"><strong>MIS Verification</strong><span>Compare synced analytical views</span></Link>
          </div>
        </section>
      </div>

      <section className="panel" id="audit">
        <div className="panel-heading"><div><p className="eyebrow">Governance</p><h2>Admin responsibilities</h2></div></div>
        <div className="admin-control-grid">
          <article><strong>Users & Roles</strong><p>Assign Inventory, Shopfloor, MIS and Admin permissions. Avoid unnecessary dual-role approvals.</p><Link className="mis-link" href="/admin/users">Manage Access →</Link></article>
          <article><strong>Master Data</strong><p>Review Item, Serial, Batch, Position and Container readiness before migration/posting.</p></article>
          <article><strong>Audit Trail</strong><p>Review who counted, moved, validated, approved or resolved exceptions and when.</p></article>
          <article><strong>Release Gates</strong><p>Keep ERP stock writes and opening-stock posting blocked until UAT and explicit approval.</p></article>
        </div>
      </section>

      <section className="role-rule-strip">
        <strong>Admin rule:</strong> approval is oversight, not a shortcut. Admin cannot bypass Inventory validation or use approval to hide unresolved traceability/reconciliation exceptions.
      </section>
    </main>
  );
}
