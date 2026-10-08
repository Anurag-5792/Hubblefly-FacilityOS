'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { resolveQr, type QrResolution } from '../../../lib/qr-resolver';
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

type LiveLookup = {
  connected: boolean;
  source: 'erpnext' | 'facilityos' | 'unavailable';
  fields: Array<{ label: string; value: string }>;
  warning?: string;
};

type ResolveApiResponse = {
  resolution: QrResolution;
  live: LiveLookup;
};

function actionHref(action: string, entity: string, type: QrResolution['type']) {
  const value = encodeURIComponent(entity);
  if (action === 'View Contents' && type === 'position') return `/inventory/position/${value}`;
  if (action === 'View Contents' && type === 'container') return `/inventory/container/${value}`;
  if (action === 'Move') return `/inventory/move?source=${value}`;
  if (action === 'Move Stock Here') return `/inventory/move?destination=${value}`;
  if (action === 'Move Container') return `/inventory/move?source=${value}`;
  if (action === 'Place Container') return `/inventory/move?destination=${value}`;
  if (action === 'Add Stock') return `/inventory/move?destination=${value}`;
  if (action === 'Remove Stock') return `/inventory/move?source=${value}`;
  if (action === 'Physical Count') return `/inventory/count?target=${value}`;
  if (action === 'Receive') return `/inventory/transaction?kind=receive&target=${value}`;
  if (action === 'Issue') return `/inventory/transaction?kind=issue&target=${value}`;
  if (action === 'Return') return `/inventory/transaction?kind=return&target=${value}`;
  return null;
}

export default function ScanPage() {
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState('');
  const localResult = useMemo(() => resolveQr(submitted), [submitted]);
  const [result, setResult] = useState<QrResolution>(localResult);
  const [live, setLive] = useState<LiveLookup | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);

  useEffect(() => {
    setResult(localResult);
    setLive(null);
    if (!submitted) return;

    const controller = new AbortController();
    setLoadingLive(true);

    fetch(`/api/resolve?value=${encodeURIComponent(submitted)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Lookup failed (${response.status})`);
        return response.json() as Promise<ResolveApiResponse>;
      })
      .then((payload) => {
        setResult(payload.resolution);
        setLive(payload.live);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLive({ connected: false, source: 'unavailable', fields: [], warning: error instanceof Error ? error.message : 'Live lookup failed.' });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingLive(false);
      });

    return () => controller.abort();
  }, [submitted, localResult]);

  function resolve(value: string) {
    setInput(value);
    setSubmitted(value.trim());
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    resolve(input);
  }

  const dataBadge = live?.source === 'erpnext'
    ? 'ERPNext live'
    : live?.source === 'facilityos'
      ? 'FacilityOS object'
      : 'Local resolution';

  return (
    <main className="scan-page">
      <header className="scan-header">
        <div>
          <Link className="back-link" href="/">← Dashboard</Link>
          <p className="eyebrow">Inventory · Universal QR resolver</p>
          <h1>Scan anything</h1>
          <p className="lead">Serial, batch, rack position, bin, box, SFG or finished aircraft. FacilityOS identifies the object first, then loads authoritative ERPNext data where applicable.</p>
        </div>
        <span className={`preview-badge ${live?.source === 'erpnext' ? 'live-badge' : ''}`}>{loadingLive ? 'Loading live data…' : dataBadge}</span>
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
                <div key={`local-${field.label}`}>
                  <dt>{field.label}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="empty-result">Scan a QR or choose a sample to begin.</div>
          )}

          {loadingLive && <div className="live-loading">Loading ERPNext / FacilityOS data…</div>}

          {live?.warning && <div className="lookup-warning">{live.warning}</div>}

          {live && live.fields.length > 0 && (
            <section className="live-data-block">
              <div className="live-data-heading">
                <p className="eyebrow">Authoritative data</p>
                <span>{live.source === 'erpnext' ? 'ERPNext' : 'FacilityOS'}</span>
              </div>
              <dl className="result-fields">
                {live.fields.map((field, index) => (
                  <div key={`live-${field.label}-${index}`}>
                    <dt>{field.label}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <div className="valid-actions">
            <p className="eyebrow">Valid actions</p>
            <div className="action-grid">
              {result.actions.map((action, index) => {
                const href = actionHref(action, result.normalized, result.type);
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
        <strong>Control boundary:</strong> QR recognition happens locally for speed. Item, Serial No and Batch information is fetched server-side from ERPNext when configured. Physical rack, position, container and genealogy objects remain FacilityOS-managed. ERPNext credentials are never sent to the browser.
      </section>
    </main>
  );
}
