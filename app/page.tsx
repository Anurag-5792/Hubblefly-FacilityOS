import Link from 'next/link';
import {CorporateBrand} from './masters/live/workspace-components';
import {workspaceModules} from '../lib/hft/ui-reuse/workspace-profile';
export const dynamic='force-dynamic';
/** Navigation only. No business data or authority is inferred from a route hint. */
export default function HomePage(){
 const modules=workspaceModules(process.env);
 return <main className="app-shell">
  <aside className="sidebar" style={{background:'#fff',color:'#193632'}}><CorporateBrand/>
   <nav aria-label="Application modules">{modules.map(m=>m.href?<Link key={m.label} style={{color:'#075b52'}} href={m.href}>{m.label}</Link>:<span key={m.label} style={{padding:'10px 14px',color:'#667a71'}}>{m.label} · HOLD</span>)}</nav>
  </aside>
  <section className="workspace"><header className="topbar"><div><p className="eyebrow">Hubblefly Technologies Limited</p><h1>HFT-OS workspace</h1><p className="masters-help">Choose a configured module. Identity, permissions and data admission are checked independently.</p></div><span className="status">NO LIVE STOCK POSTING</span></header>
   <div className="content-grid">{modules.map(m=><article className="panel" key={m.label}><h2>{m.label}</h2><p className="masters-help">{m.description}</p><p className="status">{m.status}</p>{m.href&&<Link className="mis-link" href={m.href}>Open {m.label}</Link>}</article>)}</div>
  </section>
  <nav className="mobile-nav" aria-label="Mobile application modules">{modules.filter(m=>m.href).map(m=><Link key={m.label} href={m.href!}>{m.label}</Link>)}</nav>
 </main>;
}
