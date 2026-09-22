import Link from 'next/link';

const modules = [
  {
    title: 'Goods Receipt Note',
    code: 'GRN',
    href: '/documents/grn',
    note: 'Live inward after opening stock. Reconcile with ERPNext before final submission.',
    status: 'In progress',
  },
  {
    title: 'Gate Pass',
    code: 'GP',
    href: '/documents/gate-pass',
    note: 'Operational outward permit. Supports returnable and non-returnable movement.',
    status: 'In progress',
  },
  {
    title: 'Delivery Challan',
    code: 'DC',
    href: '/documents/delivery-challan',
    note: 'Outward material document linked to verified inventory evidence.',
    status: 'In progress',
  },
  {
    title: 'Label & Print Control',
    code: 'LBL',
    href: '/labels',
    note: 'Preview, approval and print-count safety gate for all stickers and box cards.',
    status: 'In progress',
  },
  {
    title: 'Box / Bin Stock Card',
    code: 'BOX',
    href: '/labels/box-card',
    note: 'Container QR, current quantity, capacity, location and last four movements.',
    status: 'In progress',
  },
];

export default function DocumentCentrePage() {
  return (
    <main className="workflow-page role-workspace">
      <header className="role-hero role-hero-inventory">
        <div>
          <Link className="back-link role-back" href="/inventory/dashboard">← Inventory Workspace</Link>
          <p className="eyebrow">Documents & Printing</p>
          <h1>FacilityOS Document Centre</h1>
          <p className="lead">Create operational documents from verified inventory data, then check, authorize, print and reconcile them with ERPNext where applicable.</p>
        </div>
        <div className="role-identity-card">
          <span>Release state</span><strong>Preview-safe</strong><small>No ERP stock posting</small>
        </div>
      </header>

      <section className="document-module-grid">
        {modules.map((module) => (
          <Link className="document-module-card" href={module.href} key={module.code}>
            <div className="document-module-code">{module.code}</div>
            <div>
              <p className="eyebrow">{module.status}</p>
              <h2>{module.title}</h2>
              <p>{module.note}</p>
            </div>
            <span>Open →</span>
          </Link>
        ))}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-heading"><div><p className="eyebrow">Standard Control</p><h2>One evidence chain</h2></div></div>
        <div className="document-stage-grid">
          <article><span>1</span><strong>Capture</strong><small>Verified item, qty, serial/batch, container, party and purpose.</small></article>
          <article><span>2</span><strong>Check</strong><small>Second-person check before authorization/print.</small></article>
          <article><span>3</span><strong>Authorize</strong><small>Release the document only after required evidence is complete.</small></article>
          <article><span>4</span><strong>Reconcile</strong><small>Match FacilityOS document against the applicable ERPNext transaction.</small></article>
        </div>
      </section>
    </main>
  );
}
