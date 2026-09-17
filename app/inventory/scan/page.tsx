'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { resolveQr } from '../../../lib/qr-resolver';
import CameraScanner from './camera-scanner';

const samples = [
  'PSY-MTR-03-S0042',
  'PWR-BAT-01-B003',
  'R03-L2-P04-S2',
  'BN-014',
  'BB-021',
  'SFG-ARM-01-S0017',
  'DRN-TITAN-001'
];

function actionHref(action: string, entity: string) {
  const value = encodeURIComponent(entity);
  if (action === 'Move') return `/inventory/move?source=${value}`;
  if (action === 'Move Stock Here') return `/inventory/move?destination=${value}`;
  if (action === 'Move Container') return `/inventory/move?source=${value}`;
  if (action === 'Physical Count') return `/inventory/count?target=${value}`;
  return null;
}

export default function ScanPage() {
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState('');
  const result = useMemo(() => resolveQr(submitted), [submitted]);

  function resolve(value: string) {
    setInput(value);
    setSubmitted(value);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    resolve(input);
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
          <CameraScanner onDetected={resolve} />

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
                <button key={sample} onClick={() => resolve(sample)} type="button">{sample}</button>
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
              {result.actions.map((action, index) => {
                const href = actionHref(action, result.normalized);
                return href ? (
                  <Link className={index === 0 ? 'action action-featured' : 'action'} href={href} key={action}>{action}</Link>
                ) : (
                  <button className={index === 0 ? 'action action-featured' : 'action'} key={action} type="button">{action}</button>
                );
              })}
            </div>
          </div>
        </article>
      </section>

      <section className="scan-note">
        <strong>Current milestone:</strong> camera scanning, object resolution and workflow routing are now in the first implementation slice. ERPNext-backed values will come through the FacilityOS server-side adapter; no ERPNext API secret is exposed to the browser.
      </section>
    </main>
  );
}
