import Link from 'next/link';
export const dynamic='force-dynamic';
export default function DraftSignIn(){
 const enabled=Boolean(process.env.HFT_DRAFT_RUNTIME_PROFILE&&
  process.env.HFT_DRAFT_OIDC_CLIENT_ID&&
  process.env.HFT_DRAFT_OIDC_APPROVED_ACTORS_JSON);
 return <main className="masters-shell">
  <header className="masters-head"><div>
   <p className="eyebrow">Hubblefly FacilityOS · Path B</p>
   <h1>Corporate sign-in</h1>
   <p className="masters-help">Secure retained draft data entry.
    All business records remain DRAFT — NOT APPROVED.</p></div>
   <span className="status">NONPRODUCTION DRAFT</span>
  </header>
  <section className="panel">
   <h2>Verified organizational identity</h2>
   <p>Sign in through the independently configured OpenID Connect provider.
    FacilityOS accepts only an approved real identity mapped to
    an explicitly authorized provisional entity, site and warehouse scope.</p>
   {enabled?<a className="mis-link" href="/api/hft/draft/auth/start">
     Continue to corporate sign-in</a>:
    <p className="masters-help">Authentication is not yet configured for this
     preview. No demonstration account or password is available.</p>}
   <p className="masters-help">An expired, revoked or unapproved session cannot
    read or change draft records. Separate P3 and Stores access remains disabled.</p>
   <Link className="mis-link" href="/">FacilityOS home</Link>
  </section>
 </main>;
}
