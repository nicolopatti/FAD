'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Field, focusPrimoErrore } from '@/components/admin/Form';
import { isEmail, type Errori } from '@/lib/validazione';

// Versione dell'informativa accettata qui (= VERSIONE_INFORMATIVA_REGISTRAZIONE in lib/registrazione.ts).
const VERSIONE_INFORMATIVA = 2;

function messaggio(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('already registered') || m.includes('already exists')) return 'Esiste già un account con questa email: accedi o reimposta la password.';
  if (m.includes('password')) return 'La password non è accettata: usa almeno 8 caratteri, con lettere e numeri.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Troppe richieste in poco tempo: aspetta qualche minuto e riprova.';
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'La registrazione non è al momento attiva.';
  if (m.includes('fetch') || m.includes('network')) return 'Non riusciamo a raggiungere il servizio. Controlla la connessione e riprova.';
  return `Registrazione non riuscita: ${raw}`;
}

/** Modulo di registrazione: email di conferma, poi la Persona nasce al primo ingresso. */
export function RegistratiForm({ ente }: { ente: string }) {
  const [v, setV] = useState({ nome: '', cognome: '', email: '', password: '', privacy: false });
  const [errs, setErrs] = useState<Errori>({});
  const [errore, setErrore] = useState<string | null>(null);
  const [inviata, setInviata] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dopo, setDopo] = useState('/corsi');
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get('dopo');
    // Lettura una tantum dall'URL dopo il montaggio (ritorno all'acquisto).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (d && d.startsWith('/') && !d.startsWith('//')) setDopo(d);
  }, []);

  const set = (k: keyof typeof v, val: string | boolean) => {
    setV((x) => ({ ...x, [k]: val }));
    if (errs[k]) setErrs((e) => ({ ...e, [k]: '' }));
  };

  function valida(): Errori {
    const e: Errori = {};
    if (!v.nome.trim()) e.nome = 'Scrivi il nome.';
    if (!v.cognome.trim()) e.cognome = 'Scrivi il cognome.';
    if (!isEmail(v.email)) e.email = 'Scrivi un indirizzo email valido.';
    if (v.password.length < 8 || !/[A-Za-z]/.test(v.password) || !/\d/.test(v.password)) e.password = 'Almeno 8 caratteri, con lettere e numeri.';
    if (!v.privacy) e.privacy = 'Per creare l’account serve l’accettazione dell’informativa.';
    return e;
  }

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    const ve = valida();
    setErrs(ve);
    setErrore(null);
    if (Object.keys(ve).length) { focusPrimoErrore(formRef.current); return; }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const email = v.email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signUp({
        email,
        password: v.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?tipo=registrazione&next=${encodeURIComponent(dopo)}`,
          data: { nome: v.nome.trim(), cognome: v.cognome.trim(), informativa_versione: VERSIONE_INFORMATIVA },
        },
      });
      if (error) { setErrore(messaggio(error.message)); return; }
      // Con la conferma email attiva, un'email già registrata torna senza identità.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setErrore('Esiste già un account con questa email: accedi o reimposta la password.');
        return;
      }
      if (data.session) {
        // Conferma email disattivata sul progetto: si entra subito.
        await fetch('/api/auth/after-login', { method: 'POST' }).catch(() => undefined);
        window.location.assign(dopo);
        return;
      }
      setInviata(email);
    } catch (err) {
      setErrore(messaggio(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  if (inviata) {
    return (
      <div className="card registrati__ok" role="status">
        <div className="card__body">
          <h2>Controlla la posta</h2>
          <p>Abbiamo scritto a <strong>{inviata}</strong>: apri il link nell’email per confermare l’indirizzo. Poi torni qui{dopo.startsWith('/acquista') ? ' e completi l’acquisto' : ''}.</p>
          <p className="muted">Non la trovi? Guarda anche nella posta indesiderata. Il link vale per poco tempo.</p>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} className="card" onSubmit={invia} noValidate>
      <div className="card__body">
        {errore && <div className="banner banner--err" role="alert"><div className="banner__body">{errore}</div></div>}
        <div className="grid-2">
          <Field id="rg-nome" label="Nome" required error={errs.nome}>
            <input id="rg-nome" className="input" autoComplete="given-name" value={v.nome} onChange={(e) => set('nome', e.target.value)} disabled={busy} aria-invalid={Boolean(errs.nome)} autoFocus />
          </Field>
          <Field id="rg-cognome" label="Cognome" required error={errs.cognome}>
            <input id="rg-cognome" className="input" autoComplete="family-name" value={v.cognome} onChange={(e) => set('cognome', e.target.value)} disabled={busy} aria-invalid={Boolean(errs.cognome)} />
          </Field>
        </div>
        <Field id="rg-email" label="Email" required error={errs.email} hint="Ti arriverà un link per confermarla.">
          <input id="rg-email" className="input" type="email" autoComplete="email" value={v.email} onChange={(e) => set('email', e.target.value)} disabled={busy} aria-invalid={Boolean(errs.email)} />
        </Field>
        <Field id="rg-password" label="Password" required error={errs.password} hint="Almeno 8 caratteri, con lettere e numeri.">
          <input id="rg-password" className="input" type="password" autoComplete="new-password" value={v.password} onChange={(e) => set('password', e.target.value)} disabled={busy} aria-invalid={Boolean(errs.password)} />
        </Field>
        <div className={`field${errs.privacy ? ' is-invalid' : ''}`}>
          <label className="check-row">
            <input id="rg-privacy" type="checkbox" checked={v.privacy} onChange={(e) => set('privacy', e.target.checked)} disabled={busy} aria-invalid={Boolean(errs.privacy)} />
            <span>Ho letto l’<Link href="/privacy" target="_blank">informativa sul trattamento dei dati</Link> di {ente} e accetto che la mia attività sui corsi venga registrata per la tracciabilità della formazione.</span>
          </label>
          {errs.privacy && <div className="field__error" role="alert">{errs.privacy}</div>}
        </div>
        <button type="submit" className="btn btn--lg" disabled={busy}>{busy ? 'Creo l’account…' : 'Crea l’account'}</button>
      </div>
    </form>
  );
}
