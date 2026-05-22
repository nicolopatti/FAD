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
    <div className="shell" style={{ maxWidth: 420, marginTop: 80 }}>
      <h1>Accedi</h1>
      <p className="muted">Piattaforma e-learning — Fase 1.</p>
      <form onSubmit={handleLogin} className="card">
        {error && <div className="alert">{error}</div>}
        <div className="form-row">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="form-row">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" required
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Accesso in corso…' : 'Entra'}
        </button>
      </form>
      <p className="muted mono" style={{ marginTop: 24 }}>
        Demo: <code>discente@fad.local</code> / <code>discente-pass-123</code><br/>
        Demo: <code>auditor@fad.local</code> / <code>auditor-pass-123</code><br/>
        Demo: <code>admin@fad.local</code> / <code>admin-pass-123</code>
      </p>
    </div>
  );
}
