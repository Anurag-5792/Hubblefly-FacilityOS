export default function StoresPage(){
 const workflows=[
  {title:'Employee & Stores Masters',description:'Register and review scoped master change requests.',href:'/stores/masters',state:'SOURCE CANDIDATE'},
  {title:'Vendor invoice & GRN',description:'Invoice verification, partial receipts and QC still require accepted posting integration.',state:'NOT CONNECTED'},
  {title:'Material Issue & Return',description:'Employee custody, independent approvals, and inspection require qualified protected writer.',state:'NOT CONNECTED'},
  {title:'Stock balance & reconciliation',description:'No authenticated operational balances or adjustments are connected.',state:'UNAVAILABLE'}
 ];
 return <main className="masters-shell">
  <header className="masters-head"><div><p className="eyebrow">Hubblefly FacilityOS · Phase 1</p>
   <h1>Stores Operations</h1>
   <p>Operational data is unavailable until qualified persistence and approval services are installed. No preview inventory figures are shown.</p></div>
   <a href="/" className="masters-back">Operations home</a></header>
  <div className="content-grid">{workflows.map(w=><article className="panel" key={w.title}>
   <div className="panel-heading"><h2>{w.title}</h2><span className="status">{w.state}</span></div>
   <p className="masters-help">{w.description}</p>
   {'href' in w&&w.href?<a className="mis-link" href={w.href}>Open master workspace</a>:
     <span className="masters-help">Actions disabled until operational source qualification.</span>}
  </article>)}</div>
 </main>;
}
