'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Ico } from '@/components/AppShell';
import { LoginBrand, LoginPreview } from '../../login/LoginPreview';

// Scelta della password dopo un link via email (reset o invito). Il client di
// Supabase nel browser riconosce da solo la sessione portata dal link (frammento
// `#…` dei modelli predefiniti oppure `?code=` PKCE) e la salva nei cookie; da
// lì la pagina chiama le route server, che registrano gli Eventi.
// Al primo accesso (nessun Evento `informativa.accettata`) chiede di accettare
// l'informativa sul trattamento dei dati.
type Stato = 'attesa' | 'pronto' | 'nessuna';

export default function ReimpostaPage() {
  const router = useRouter();
  const [stato, setStato] = useState<Stato>('attesa');
  const [primo, setPrimo] = useState(false);
  const [password, setPassword] = useState('');
  const [conferma, setConferma] = useState('');
  const [mostra, setMostra] = useState(false);
  const [accetto, setAccetto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let risolto = false;
    async function pronto(client: SupabaseClient) {
      if (risolto) return;
      risolto = true;
      const { data } = await client.from('evento').select('id').eq('event_type', 'informativa.accettata').limit(1);
      setPrimo(!data || data.length === 0);
      setStato('pronto');
    }
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, session) => { if (session) void pronto(supabase); });
    void supabase.auth.getSession().then(({ data }) => { if (data.session) void pronto(supabase); });
    const t = setTimeout(() => { if (!risolto) setStato('nessuna'); }, 5000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    if (password.length < 10) { setErrore('La password deve avere almeno 10 caratteri.'); return; }
    if (password !== conferma) { setErrore('Le due password non coincidono.'); return; }
    if (primo && !accetto) { setErrore('Per usare la piattaforma devi accettare l’informativa.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/profilo/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Non siamo riusciti a salvare la password. Riprova.');
      if (primo) {
        await fetch('/api/profilo/informativa', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ versione: 1 }) }).catch(() => undefined);
      }
      await fetch('/api/auth/after-login', { method: 'POST' }).catch(() => undefined);
      router.replace('/');
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login__form">
        <LoginBrand />
        {stato === 'attesa' && <p className="page-lead" style={{ fontSize: 15 }}>Un momento, stiamo verificando il link…</p>}
        {stato === 'nessuna' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 380 }}>
            <h1 className="login__title">Link non valido.</h1>
            <p className="page-lead" style={{ fontSize: 15 }}>Il link è scaduto o è già stato usato. Richiedine uno nuovo: vale un&apos;ora dall&apos;invio.</p>
            <Link href="/password-dimenticata" className="btn" style={{ alignSelf: 'flex-start' }}>Richiedi un nuovo link</Link>
            <Link href="/login" className="page-lead" style={{ fontSize: 13 }}>Torna all&apos;accesso</Link>
          </div>
        )}
        {stato === 'pronto' && (
          <form onSubmit={salva} noValidate>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h1 className="login__title">{primo ? 'Benvenuto.' : 'Nuova password.'}<br />Scegli la tua password.</h1>
              <p className="page-lead" style={{ fontSize: 15 }}>Almeno 10 caratteri. Meglio una frase facile da ricordare per te e difficile da indovinare per gli altri.</p>
            </div>
            {errore && <div className="login__error" role="alert"><Ico name="info" size={18} /><div>{errore}</div></div>}
            <div className="login__field">
              <label htmlFor="pw">Nuova password</label>
              <div className="login__pw">
                <input id="pw" type={mostra ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
                <button type="button" className="login__eye" onClick={() => setMostra((v) => !v)} aria-label={mostra ? 'Nascondi password' : 'Mostra password'} aria-pressed={mostra}><Ico name="eye" size={18} /></button>
              </div>
            </div>
            <div className="login__field">
              <label htmlFor="pw2">Ripeti la password</label>
              <input id="pw2" type={mostra ? 'text' : 'password'} value={conferma} onChange={(e) => setConferma(e.target.value)} autoComplete="new-password" />
            </div>
            {primo && (
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: 'var(--ink)' }}>
                <input type="checkbox" checked={accetto} onChange={(e) => setAccetto(e.target.checked)} style={{ marginTop: 3 }} />
                <span>Ho letto l&apos;informativa sul trattamento dei dati personali fornita dal mio ente di formazione e accetto che la mia attività sui corsi venga registrata ai fini della tracciabilità della formazione.</span>
              </label>
            )}
            <button type="submit" className="btn btn--lg" disabled={busy}>{busy ? 'Salvataggio…' : primo ? 'Salva ed entra' : 'Salva la nuova password'}</button>
          </form>
        )}
      </section>
      <LoginPreview />
    </div>
  );
}
