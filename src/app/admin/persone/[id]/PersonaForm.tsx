'use client';

import { useState } from 'react';
import type { PersonaRiepilogo } from '@/lib/db-types';
import { Icon } from '@/components/admin/Atlante';
import { Field } from '@/components/admin/Form';
import { useFeedback } from '@/components/ui/Feedback';
import { useCall } from '@/components/admin/useCall';
import { ErrorBanner } from '@/components/admin/ErrorBanner';
import { isCodiceFiscale, isEmail, type Errori } from '@/lib/validazione';

/** Anagrafica della persona + invito. I dati di nascita servono all'attestato. */
export function PersonaForm({ persona }: { persona: PersonaRiepilogo }) {
  const { confirm } = useFeedback();
  const { call, busy, error } = useCall();
  const [f, setF] = useState({
    nome: persona.nome, cognome: persona.cognome, email: persona.email,
    codice_fiscale: persona.codice_fiscale ?? '', data_nascita: persona.data_nascita ?? '', luogo_nascita: persona.luogo_nascita ?? '',
  });
  const [errs, setErrs] = useState<Errori>({});
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); if (errs[k]) setErrs({ ...errs, [k]: '' }); };
  const orig = { nome: persona.nome, cognome: persona.cognome, email: persona.email, codice_fiscale: persona.codice_fiscale ?? '', data_nascita: persona.data_nascita ?? '', luogo_nascita: persona.luogo_nascita ?? '' };
  const dirty = (Object.keys(f) as (keyof typeof f)[]).some((k) => f[k].trim() !== orig[k]);

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    const ve: Errori = {};
    if (!f.cognome.trim()) ve.cognome = 'Il cognome è obbligatorio.';
    if (!f.nome.trim()) ve.nome = 'Il nome è obbligatorio.';
    if (!isEmail(f.email.trim())) ve.email = 'Controlla l\'indirizzo: non sembra un\'email valida.';
    if (f.codice_fiscale.trim() && !isCodiceFiscale(f.codice_fiscale.trim())) ve.codice_fiscale = 'Il codice fiscale deve avere 16 caratteri nel formato previsto.';
    setErrs(ve);
    if (Object.keys(ve).length) return;
    if (f.email.trim().toLowerCase() !== persona.email && persona.accesso) {
      const ok = await confirm({ titolo: 'Cambiare l\'email di accesso?', messaggio: `La persona ha già l'accesso: da questo momento entra con ${f.email.trim().toLowerCase()} (la password resta la stessa) e non più con ${persona.email}. Avvisala del cambio.`, conferma: 'Cambia email' });
      if (!ok) return;
    }
    const body: Record<string, string | null> = {};
    (Object.keys(f) as (keyof typeof f)[]).forEach((k) => { if (f[k].trim() !== orig[k]) body[k] = f[k].trim() || null; });
    try { await call('PATCH', `/api/admin/persone/${persona.id}`, body, { successo: 'Anagrafica salvata.', busy: setSalvando }); } catch { /* banner */ }
  }

  return (
    <form className="card" onSubmit={salva} noValidate>
      <div className="card__head">
        <div><h3>Anagrafica</h3><div className="sub">Nome, cognome e dati di nascita finiscono sugli attestati; il codice fiscale nella rendicontazione.</div></div>
        {!persona.accesso && (
          <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={async () => {
            if (!(await confirm({ titolo: `Inviare l'invito a ${persona.cognome} ${persona.nome}?`, messaggio: `Riceve all'indirizzo ${persona.email} un'email con il link per scegliere la password ed entrare.`, conferma: 'Invia l\'invito' }))) return;
            await call('POST', `/api/admin/persone/${persona.id}/invita`, undefined, { successo: `Invito inviato a ${persona.email}.` }).catch(() => { /* banner */ });
          }}>Invita</button>
        )}
      </div>
      <div className="card__body">
        <ErrorBanner error={error} />
        <div className="grid-3">
          <Field id="p-cognome" label="Cognome" required error={errs.cognome}><input id="p-cognome" className="input" value={f.cognome} onChange={set('cognome')} disabled={busy} aria-invalid={Boolean(errs.cognome)} /></Field>
          <Field id="p-nome" label="Nome" required error={errs.nome}><input id="p-nome" className="input" value={f.nome} onChange={set('nome')} disabled={busy} aria-invalid={Boolean(errs.nome)} /></Field>
          <Field id="p-email" label="Email" required error={errs.email} hint={persona.accesso ? 'Ha già l’accesso: se la cambi, da quel momento entra con la nuova email.' : 'È l’indirizzo a cui arriva l’invito.'}><input id="p-email" className="input" type="email" value={f.email} onChange={set('email')} disabled={busy} aria-invalid={Boolean(errs.email)} /></Field>
        </div>
        <div className="grid-3">
          <Field id="p-cf" label="Codice fiscale" error={errs.codice_fiscale}><input id="p-cf" className="input mono" value={f.codice_fiscale} onChange={set('codice_fiscale')} disabled={busy} aria-invalid={Boolean(errs.codice_fiscale)} /></Field>
          <Field id="p-dn" label="Data di nascita"><input id="p-dn" className="input" type="date" value={f.data_nascita} onChange={set('data_nascita')} disabled={busy} /></Field>
          <Field id="p-ln" label="Luogo di nascita"><input id="p-ln" className="input" value={f.luogo_nascita} onChange={set('luogo_nascita')} disabled={busy} /></Field>
        </div>
        <button type="submit" className="btn" disabled={busy || !dirty}><Icon name="check" /> {salvando ? 'Salvo…' : 'Salva'}</button>
      </div>
    </form>
  );
}
