import Link from 'next/link';
export default function SettingsPage(){return <main className="masters-shell">
 <header className="masters-head"><div><p className="eyebrow">FacilityOS / Settings</p><h1>Settings</h1></div>
 <Link className="masters-back" href="/">Back to dashboard</Link></header>
 <section className="panel"><h2>Users &amp; Roles</h2><p className="masters-help">
 Assign application roles to existing active employees. Review permissions, scope, dates and assignment history.</p>
 <p><Link className="mis-link" href="/settings/users-roles">Open Role Assignment</Link></p></section>
 </main>;}
