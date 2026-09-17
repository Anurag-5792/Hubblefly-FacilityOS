'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { resolveQr } from '../../../lib/qr-resolver';

const samples = [
  'PSY-MTR-03-S0042',
  'PWR-BAT-01-B003',
  'R03-L2-P04-S2',
  'BN-014',
  'BB-021',
  'SFG-ARM-01-S0017',
  'DRN-TITAN-001'
];

export default function ScanPage() {
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState('');
  const result = useMemo(() => resolveQr(submitted), [submitted]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(input);
  }

  return (
    <main className="scan-page">
      <header className="scan-header">
        <div>
          <Link className="back-link" href="/">← Dashboard</Link>
          <p className="eyebrow">Inventory · Universal QR resolver</p>
          <h1>Scan anything</h1>
          <p className="lead">Serial, batch, rack position, bin, box, SFG or finished aircraft. FacilityOS identifies the object first, then offers only valid actions.</p>
        </div>
        <span className="preview-badge">Preview data</span>
      </header>

      <section className="scan-layout">
        <article className="panel scan-input-panel">
          <div className="camera-box" aria-hidden="true">
            <div className="camera-frame">QR</div>
          </div>

          <form onSubmit={submit} className="scan-form">
            <label htmlFor="qr-value">Scanner / QR value</label>
            <div className="scan-input-row">
              <input
                id="qr-value"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Scan or type an ID"
                autoComplete="off"
                autoFocus
              />
              <button className="scan-primary" type="submit">Resolve</button>
            </div>
          </form>

          <div className="sample-area">
            <span>Try a sample</span>
            <div className="sample-chips">
              {samples.map((sample) => (
                <button key={sample} onClick={() => { setInput(sample); setSubmitted(sample); }} type="button">{sample}</button>
              ))}
            </div>
          </div>
        </article>

        <article className={`panel resolution-panel resolution-${result.type}`}>
          <div className="resolution-heading">
            <div>
              <p className="eyebrow">Resolved object</p>
              <h2>{result.title}</h2>
              <p>{result.subtitle}</p>
            </div>
            <span className="entity-pill">{result.type.toUpperCase()}</span>
          </div>

          {result.fields.length > 0 ? (
            <dl className="result-fields">
              {result.fields.map((field) => (
                <div key={field.label}>
                  <dt>{field.label}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="empty-result">Scan a QR or choose a sample to begin.</div>
          )}

          <div className="valid-actions">
            <p className="eyebrow">Valid actions</p>
            <div className="action-grid">
              {result.actions.map((action, index) => (
                <button className={index === 0 ? 'action action-featured' : 'action'} key={action} type="button">{action}</button>
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className="scan-note">
        <strong>Current milestone:</strong> object resolution and workflow routing. Camera decoding and real ERPNext data will be connected through the FacilityOS server-side adapter next; no ERPNext API secret will be exposed to the browser.
      </section>
    </main>
  );
}
