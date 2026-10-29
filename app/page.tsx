/** No operational KPI may be shown without a verified, connected source. */
export default function HomePage(){
 return <main className="app-shell">
  <aside className="sidebar"><div className="brand">HUBBLEFLY <span>FacilityOS</span></div>
   <nav><a className="active" href="/">Dashboard</a>
    <a href="/stores">Stores</a><a href="/stores/masters">Employee & Master Data</a>
    <a href="/mis">MIS & Analytics</a></nav>
   <div className="sidebar-footer">Phase 1 standalone <strong>ERPNext deferred to Phase 2</strong></div></aside>
  <section className="workspace"><header className="topbar"><div>
   <p className="eyebrow">Hubblefly Technologies Limited</p><h1>Operations Dashboard</h1>
   </div><span className="status">NONPRODUCTION — NO LIVE POSTING</span></header>
   <div className="stats-grid">{['Items in store','Open exceptions','Moves today','Pending counts'].map(label=>
    <article key={label} className="stat-card"><span>{label}</span>
     <strong style={{fontSize:20}}>Unavailable</strong>
     <p className="masters-help">Verified operational source not connected</p></article>)}</div>
   <div className="content-grid">
    <article className="panel"><p className="eyebrow">Phase 1</p><h2>Employee & Stores Masters</h2>
     <p className="masters-help">Scope-controlled master registration, amendments and pending approval requests.
      Persistence requires approved isolated PostgreSQL and governance authority.</p>
     <a className="mis-link" href="/stores/masters">Open master workspace</a></article>
    <article className="panel"><p className="eyebrow">Stores</p><h2>Stock workflows</h2>
     <p className="masters-help">GRN, QC, Issue, Return, Custody and stock adjustments remain disabled until qualified protected posting.</p>
     <a className="mis-link" href="/stores">View workflow availability</a></article>
    <article className="panel"><p className="eyebrow">Analytics</p><h2>MIS</h2>
     <p className="masters-help">No synthetic stock charts or KPI totals. Reporting requires verified FacilityOS source data.</p>
     <a className="mis-link" href="/mis">View reporting status</a></article>
   </div>
  </section>
  <nav className="mobile-nav"><a href="/">Home</a><a href="/stores">Stores</a>
   <a href="/stores/masters">Masters</a><a href="/mis">MIS</a></nav>
 </main>;
}
