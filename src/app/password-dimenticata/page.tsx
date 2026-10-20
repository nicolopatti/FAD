'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Ico } from '@/components/AppShell';
import { LoginBrand, LoginPreview } from '../login/LoginPreview';

// Password dimenticata: Supabase Auth manda un'email con un link verso
// /auth/reimposta (stesso dominio da cui si chiede). La risposta è sempre
// neutra: non rivela se l'indirizzo esiste.
export default function PasswordDimenticataPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [fatto, setFatto] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErrore(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/reimposta`,
      });
      if (error) {
        const m = error.message.toLowerCase();
        setErrore(m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')
          ? 'Hai appena richiesto un link: aspetta un minuto prima di chiederne un altro.'
          : 'Non siamo riusciti a inviare l’email. Riprova fra poco.');
        return;
      }
      setFatto(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login__form">
        <LoginBrand />
        {fatto ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 380 }}>
            <h1 className="login__title">Controlla la posta.</h1>
            <p className="page-lead" style={{ fontSize: 15 }}>
              Se <strong>{email}</strong> è registrato, riceverai fra poco un&apos;email con il link per scegliere una nuova password. Il link vale un&apos;ora.
            </p>
            <p className="page-lead" style={{ fontSize: 13 }}>Non arriva? Guarda nella posta indesiderata o chiedi al referente della formazione.</p>
            <Link href="/login" className="btn btn--secondary" style={{ alignSelf: 'flex-start' }}>Torna all&apos;accesso</Link>
          </div>
        ) : (
          <form onSubmit={invia}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h1 className="login__title">Password dimenticata?</h1>
              <p className="page-lead" style={{ fontSize: 15 }}>
                Scrivi l&apos;email con cui accedi: ti mandiamo un link per sceglierne una nuova.
              </p>
            </div>
            {errore && (
              <div className="login__error" role="alert"><Ico name="info" size={18} /><div>{errore}</div></div>
            )}
            <div className="login__field">
              <label htmlFor="email">Indirizzo email</label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="nome@azienda.it" autoFocus />
            </div>
            <button type="submit" className="btn btn--lg" disabled={busy || !email.trim()}>{busy ? 'Invio in corso…' : 'Inviami il link'}</button>
            <Link href="/login" className="page-lead" style={{ fontSize: 13 }}>Torna all&apos;accesso</Link>
          </form>
        )}
      </section>
      <LoginPreview />
    </div>
  );
}
