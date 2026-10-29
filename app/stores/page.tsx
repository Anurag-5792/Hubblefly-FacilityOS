export default function StoresPage(){
 const workflows=[
  {title:'Stores IN / OUT / Count / Transfer',
   description:'Signed structural preflight for receipts, employee issue, physical bin count and location transfer. NOT connected to authoritative posting or durable count storage.',
   href:'/stores/operations',state:'VALIDATION ONLY — NOT OPERATIONAL'},
  {title:'Employee & Stores Masters',
   description:'Register and review scoped master change requests.',
   href:'/stores/masters',state:'SOURCE CANDIDATE'},
  {title:'Vendor invoice & GRN',
   description:'Invoice verification, partial receipts and QC require accepted protected posting integration.',
   state:'NOT CONNECTED'},
  {title:'Material Issue & Return',
   description:'Employee custody, independent approvals, and inspection require qualified protected writer.',
   state:'NOT CONNECTED'},
  {title:'Stock balance & reconciliation',
   description:'No authenticated operational balances or adjustments are connected.',
   state:'UNAVAILABLE'}
 ];
 return <main className="masters-shell">
  <header className="masters-head"><div><p className="eyebrow">Hubblefly FacilityOS · Phase 1</p>
   <h1>Stores Operations</h1>
   <p>Production use requires an accepted database, genuine human approvals and tested stock transactions.
    No preview inventory counts are displayed. The source workbench validates requests only and does not save stock.</p></div>
   <a href="/" className="masters-back">Operations home</a></header>
  <div className="content-grid">{workflows.map(w=><article className="panel" key={w.title}>
   <div className="panel-heading"><h2>{w.title}</h2><span className="status">{w.state}</span></div>
   <p className="masters-help">{w.description}</p>
   {'href' in w&&w.href?<a className="mis-link" href={w.href}>Open source workspace</a>:
    <span className="masters-help">Actions disabled until operational source qualification.</span>}
  </article>)}</div>
 </main>;
}
