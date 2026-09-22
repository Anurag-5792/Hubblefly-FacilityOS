'use client';

import { useEffect, useState } from 'react';

export default function ClientCheckPage() {
  const [status, setStatus] = useState('Waiting for browser hydration…');

  useEffect(() => {
    setStatus('Client hydration OK');
  }, []);

  return (
    <main className="workflow-page">
      <section className="panel">
        <p className="eyebrow">FacilityOS Diagnostics</p>
        <h1>Client Runtime Check</h1>
        <p className="lead">This route verifies that React can hydrate and run browser-side code on the Vercel deployment.</p>
        <dl className="result-fields">
          <div><dt>Status</dt><dd>{status}</dd></div>
          <div><dt>Expected</dt><dd>Client hydration OK</dd></div>
        </dl>
        <div className="workflow-actions" style={{ marginTop: 16 }}>
          <a className="scan-primary scan-link" href="/">Home</a>
          <a className="action action-link" href="/roles">Role Workspaces</a>
        </div>
      </section>
    </main>
  );
}
