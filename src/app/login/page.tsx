'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('discente@fad.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    // Server-side: log dell'evento auth.login (passa per audit_append)
    await fetch('/api/auth/after-login', { method: 'POST' });
    router.replace('/');
  }

  return (
    <div className="login-split">
      {/* Visual */}
      <div className="login-visual">
        <div aria-hidden="true" className="login-visual__orb login-visual__orb--1" />
        <div aria-hidden="true" className="login-visual__orb login-visual__orb--2" />

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="login-mark">F</div>
          <div style={{ lineHeight: 1.1 }}>
            <strong style={{ fontSize: 15, fontWeight: 700 }}>FAD</strong>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', letterSpacing: '.04em' }}>
              Formazione a distanza
            </div>
          </div>
        </div>

        <div style={{ position: 'relative', maxWidth: 480 }}>
          <div className="login-pill">VERIFICATA · APPEND-ONLY · TRACCIATA</div>
          <h1 className="login-headline">
            La tua formazione,
            <br />
            <em>verificabile</em>
            <br />e a prova di audit.
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: 'rgba(255,255,255,.78)', maxWidth: 420, margin: 0 }}>
            Ogni evento del player è firmato e concatenato in un log immutabile: la
            tua idoneità è ricalcolata da prove crittografiche, non da una colonna di
            stato.
          </p>
        </div>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 24, fontSize: 12, color: 'rgba(255,255,255,.55)' }}>
          <span>Sicurezza sul lavoro · GDPR · Antincendio</span>
        </div>
      </div>

      {/* Form */}
      <div className="login-formside">
        <div style={{ maxWidth: 380, width: '100%', margin: '0 auto' }}>
          <span className="eyebrow">Accedi</span>
          <h1 style={{ marginTop: 10, marginBottom: 8, fontSize: 40 }}>Bentornato.</h1>
          <p className="meta" style={{ marginBottom: 32, fontSize: 15 }}>
            Inserisci le credenziali fornite dal tuo ente di formazione.
          </p>

          <form onSubmit={handleLogin} className="stack">
            {error && <div className="alert bad">{error}</div>}
            <div className="form-row">
              <label htmlFor="email">Indirizzo email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
              />
            </div>
            <div className="form-row">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <button type="submit" className="btn btn--lg btn--block" disabled={busy}>
              {busy ? 'Accesso in corso…' : 'Entra in piattaforma'}
            </button>
          </form>

          <div
            style={{
              marginTop: 36,
              padding: '18px 20px',
              background: 'var(--surface-2)',
              borderRadius: 12,
              border: '1px solid var(--border)',
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 10, fontSize: 10 }}>
              Credenziali demo
            </div>
            <div className="mono" style={{ fontSize: 12.5, lineHeight: 2, color: 'var(--ink-2)' }}>
              <button type="button" className="login-demo" onClick={() => { setEmail('discente@fad.local'); setPassword('discente-pass-123'); }}>
                discente@fad.local
              </button>
              <span style={{ color: 'var(--muted)' }}> · discente</span>
              <br />
              <button type="button" className="login-demo" onClick={() => { setEmail('auditor@fad.local'); setPassword('auditor-pass-123'); }}>
                auditor@fad.local
              </button>
              <span style={{ color: 'var(--muted)' }}> · auditor</span>
              <br />
              <button type="button" className="login-demo" onClick={() => { setEmail('admin@fad.local'); setPassword('admin-pass-123'); }}>
                admin@fad.local
              </button>
              <span style={{ color: 'var(--muted)' }}> · admin</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
