'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('FacilityOS global error', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'Arial, sans-serif', background: '#f5f7fb', color: '#10213b' }}>
        <main style={{ maxWidth: 760, margin: '48px auto', padding: 24 }}>
          <section style={{ background: '#fff', border: '1px solid #dfe6ef', borderRadius: 18, padding: 24 }}>
            <p style={{ color: '#f47a20', fontWeight: 800, textTransform: 'uppercase', fontSize: 12 }}>FacilityOS Diagnostics</p>
            <h1>Application error captured</h1>
            <p>The app caught the browser-side error instead of showing the generic Next.js exception screen.</p>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: '#eef3f9', padding: 14, borderRadius: 12 }}>
              {error.message || 'Unknown client error'}
              {error.digest ? '\nDigest: ' + error.digest : ''}
            </pre>
            <button onClick={() => reset()} style={{ background: '#f47a20', color: '#fff', border: 0, borderRadius: 10, padding: '11px 16px', fontWeight: 800 }}>
              Retry
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
