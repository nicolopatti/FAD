'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Ico } from '@/components/AppShell';

// Traduzione dei messaggi di Supabase Auth: all'utente arriva una frase in
// italiano che dice anche cosa fare, mai il testo grezzo in inglese.
function messaggioErrore(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('invalid login credentials')) {
    return 'Email o password non corretti. Controlla le maiuscole e riprova, oppure reimposta la password.';
  }
  if (m.includes('email not confirmed')) return "L'indirizzo email non è ancora stato confermato: controlla la posta.";
  if (m.includes('rate limit') || m.includes('too many')) return 'Troppi tentativi in poco tempo. Aspetta un minuto e riprova.';
  if (m.includes('fetch') || m.includes('network')) return 'Non riusciamo a raggiungere il servizio. Controlla la connessione e riprova.';
  return `Accesso non riuscito: ${raw}`;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostra, setMostra] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(messaggioErrore(error.message));
        setBusy(false);
        return;
      }
      // Server-side: log dell'evento auth.login (passa per audit_append).
      await fetch('/api/auth/after-login', { method: 'POST' }).catch(() => undefined);
      router.replace('/');
    } catch (err) {
      setError(messaggioErrore(err instanceof Error ? err.message : String(err)));
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login__form">
        <span className="topbar__brand">
          <span className="topbar__mark" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M6 4l14 8-14 8z" /></svg>
          </span>
          FAD
        </span>

        <form onSubmit={handleLogin}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h1 className="login__title">Bentornato.<br />Riprendi da dove eri.</h1>
            <p className="page-lead" style={{ fontSize: 15 }}>
              Usa l&apos;email e la password che ti ha inviato il tuo ente di formazione.
            </p>
          </div>

          {error && (
            <div className="login__error" role="alert">
              <Ico name="info" size={18} />
              <div>{error}</div>
            </div>
          )}

          <div className="login__field">
            <label htmlFor="email">Indirizzo email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="nome@azienda.it"
              autoFocus
            />
          </div>
          <div className="login__field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label htmlFor="password">Password</label>
              <span className="page-lead" style={{ fontSize: 13 }} title="Chiedila al referente della formazione">
                Password dimenticata? Chiedi al tuo referente.
              </span>
            </div>
            <div className="login__pw">
              <input
                id="password"
                type={mostra ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
              />
              <button
                type="button"
                className="login__eye"
                onClick={() => setMostra((v) => !v)}
                aria-label={mostra ? 'Nascondi password' : 'Mostra password'}
                aria-pressed={mostra}
              >
                <Ico name="eye" size={18} />
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn--lg" disabled={busy}>
            {busy ? 'Accesso in corso…' : 'Entra nel corso'}
          </button>
        </form>

        <p className="page-lead" style={{ fontSize: 13, margin: 0 }}>
          Non hai le credenziali? Chiedile al referente della formazione della tua azienda.
        </p>
      </section>

      {/* Anteprima: racconta che è una piattaforma video e cosa succede dentro */}
      <section className="login__preview" aria-hidden="true">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 460 }}>
          <h2>Video, ritmo tuo, risultato certo.</h2>
          <p>Le lezioni si sbloccano una dopo l&apos;altra e ogni completamento resta registrato: a fine corso l&apos;idoneità è già pronta.</p>
        </div>
        <div className="login__player">
          <span className="login__play">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l12 7-12 7z" /></svg>
          </span>
          <div className="login__bar">
            <div className="login__bar-meta"><span>Lezione 3 · Il sistema dei finanziamenti privati</span><span>5:31 / 8:39</span></div>
            <div className="login__bar-track"><div className="login__bar-fill" /></div>
          </div>
        </div>
        <div className="login__card">
          <span className="ok"><Ico name="check" size={13} /></span>
          <span><strong>Lezione 2 completata</strong> · registrata alle 09:31</span>
        </div>
      </section>
    </div>
  );
}
