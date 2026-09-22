'use client';

import { useEffect } from 'react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('FacilityOS route error', error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="workflow-page">
          <section className="panel workflow-result error">
            <p className="eyebrow">FacilityOS Error</p>
            <h1>This page hit a client error</h1>
            <p className="lead">The app is running, but this route failed during rendering. Use the details below so we can identify the exact fault.</p>
            <dl className="result-fields">
              <div><dt>Message</dt><dd>{error.message || 'Unknown client error'}</dd></div>
              <div><dt>Digest</dt><dd>{error.digest ?? '—'}</dd></div>
            </dl>
            <div className="workflow-actions" style={{ marginTop: 16 }}>
              <button className="scan-primary" type="button" onClick={() => reset()}>Retry page</button>
              <a className="action action-link" href="/">Return home</a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
