export default function MISPage(){
 return <main className="masters-shell">
  <header className="masters-head"><div><p className="eyebrow">Management Information System</p>
   <h1>Operational reporting unavailable</h1>
   <p>No authorized reporting database is connected. Inventory totals, movements and charts are intentionally withheld rather than replaced with preview figures.</p>
   </div><a className="masters-back" href="/">Operations home</a></header>
  <section className="panel"><div className="panel-heading"><h2>Reporting readiness</h2>
    <span className="status">NOT QUALIFIED</span></div>
   <p className="masters-help">Phase 1 FacilityOS will provide standalone operational analytics after role-scoped read models, immutable ledger reconstruction and audit qualification. ERPNext reporting is Phase 2.</p>
   <a href="/stores" className="mis-link">View Stores source status</a>
  </section>
 </main>;
}
