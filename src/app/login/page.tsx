'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Ico } from '@/components/AppShell';
import { LoginBrand, LoginPreview } from './LoginPreview';

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

const AVVISI: Record<string, string> = {
  link: 'Il link non è più valido o è già stato usato: richiedi un nuovo link con "Password dimenticata".',
  password: 'Password aggiornata: entra con quella nuova.',
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostra, setMostra] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Letto dal browser per non richiedere un confine Suspense su useSearchParams.
    const p = new URLSearchParams(window.location.search);
    const a = p.get('errore') ?? p.get('info');
    // Lettura una tantum dall'URL dopo il montaggio (non è uno stato derivato).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (a && AVVISI[a]) setAvviso(AVVISI[a]);
  }, []);

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
        <LoginBrand />

        <form onSubmit={handleLogin}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h1 className="login__title">Bentornato.<br />Riprendi da dove eri.</h1>
            <p className="page-lead" style={{ fontSize: 15 }}>
              Usa l&apos;email e la password che ti ha inviato il tuo ente di formazione.
            </p>
          </div>

          {avviso && !error && (
            <div className="login__error" role="status" style={{ background: 'var(--surface-2, var(--bg))', color: 'var(--ink)' }}>
              <Ico name="info" size={18} />
              <div>{avviso}</div>
            </div>
          )}
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
              <Link href="/password-dimenticata" className="page-lead" style={{ fontSize: 13 }}>
                Password dimenticata?
              </Link>
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

      <LoginPreview />
    </div>
  );
}
