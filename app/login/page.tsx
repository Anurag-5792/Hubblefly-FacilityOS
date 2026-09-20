'use client';

import { FormEvent, useState } from 'react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || payload.ok === false) {
        setError(payload.error ?? 'Login failed.');
        return;
      }
      window.location.href = '/';
    } catch {
      setError('Login could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workflow-page">
      <header className="scan-header">
        <div>
          <p className="eyebrow">Hubblefly FacilityOS</p>
          <h1>Sign in</h1>
          <p className="lead">Use your FacilityOS / Frappe user account. Roles and validation authority are taken from the authenticated server session.</p>
        </div>
      </header>

      <section className="panel" style={{ maxWidth: 560 }}>
        <form className="scan-form" onSubmit={login}>
          <label htmlFor="username">Email / Username</label>
          <input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
          {error && <div className="lookup-warning">{error}</div>}
          <button className="scan-primary" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </section>
    </main>
  );
}
