'use client';

import { useState } from 'react';
import { useFeedback } from '@/components/ui/Feedback';

// Cambio password dal profilo: due campi, controllo lato client, poi la route
// server che aggiorna Supabase Auth e scrive l'Evento.
export function PasswordForm() {
  const { toast } = useFeedback();
  const [password, setPassword] = useState('');
  const [conferma, setConferma] = useState('');
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [aperto, setAperto] = useState(false);

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    if (password.length < 10) { setErrore('La password deve avere almeno 10 caratteri.'); return; }
    if (password !== conferma) { setErrore('Le due password non coincidono.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/profilo/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Non siamo riusciti a cambiare la password. Riprova.');
      toast('Password aggiornata.');
      setPassword(''); setConferma(''); setAperto(false);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  if (!aperto) {
    return <div><button type="button" className="btn btn--secondary btn--sm" onClick={() => setAperto(true)}>Cambia password</button></div>;
  }
  return (
    <form onSubmit={salva} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <label className="field">
          <span>Nuova password</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" disabled={busy} />
        </label>
        <label className="field">
          <span>Ripeti la password</span>
          <input className="input" type="password" value={conferma} onChange={(e) => setConferma(e.target.value)} autoComplete="new-password" disabled={busy} />
        </label>
      </div>
      {errore && <div className="field__error" role="alert">{errore}</div>}
      <div className="row" style={{ gap: 8 }}>
        <button type="submit" className="btn btn--sm" disabled={busy}>{busy ? 'Salvataggio…' : 'Salva la nuova password'}</button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => { setAperto(false); setErrore(null); }}>Annulla</button>
      </div>
    </form>
  );
}
