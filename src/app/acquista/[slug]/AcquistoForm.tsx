'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Field, focusPrimoErrore } from '@/components/admin/Form';
import type { Errori } from '@/lib/validazione';
import { TESTO_RECESSO, validaFatturazione, type Fatturazione } from '@/lib/vendita';

type Iniziale = { nome: string; cognome: string; codice_fiscale: string };

/** Dati di fatturazione e consensi, poi la pagina di pagamento di Stripe. */
export function AcquistoForm({ slug, tipo, iniziale }: { slug: string; tipo: 'online' | 'date'; iniziale: Iniziale }) {
  const [f, setF] = useState<Fatturazione>({ tipo: 'privato', nome: iniziale.nome, cognome: iniziale.cognome, codice_fiscale: iniziale.codice_fiscale, indirizzo: '', cap: '', citta: '', provincia: '', nazione: 'IT' });
  const [termini, setTermini] = useState(false);
  const [recesso, setRecesso] = useState(false);
  const [errs, setErrs] = useState<Errori>({});
  const [errore, setErrore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const set = (k: keyof Fatturazione, v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    if (errs[k]) setErrs((e) => ({ ...e, [k]: '' }));
  };

  async function paga(e: React.FormEvent) {
    e.preventDefault();
    const { errori } = validaFatturazione(f);
    if (!termini) errori.termini = 'Serve l’accettazione dei termini di vendita.';
    if (!recesso) errori.recesso = 'Serve la conferma per iniziare subito il corso.';
    setErrs(errori);
    setErrore(null);
    if (Object.keys(errori).length) { focusPrimoErrore(formRef.current); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/acquisto', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug, fatturazione: f, termini, recesso }) });
      const j = await res.json().catch(() => ({})) as { ok?: boolean; url?: string; error?: string; errori?: Errori };
      if (!res.ok || !j.ok || !j.url) {
        if (j.errori) { setErrs(j.errori); focusPrimoErrore(formRef.current); }
        setErrore(j.error ?? `Errore ${res.status}`);
        setBusy(false);
        return;
      }
      window.location.assign(j.url);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const inv = (k: string) => Boolean(errs[k]) || undefined;
  const azienda = f.tipo === 'azienda';

  return (
    <form ref={formRef} className="card" onSubmit={paga} noValidate>
      <div className="card__body">
        {errore && <div className="banner banner--err" role="alert"><div className="banner__body">{errore}</div></div>}
        <h2 style={{ marginTop: 0 }}>Dati per la fattura</h2>
        <div className="seg seg--mono" role="group" aria-label="Intestatario" style={{ marginBottom: 14 }}>
          <button type="button" className={!azienda ? 'is-active' : ''} onClick={() => setF((x) => ({ ...x, tipo: 'privato' }))} disabled={busy}>Privato</button>
          <button type="button" className={azienda ? 'is-active' : ''} onClick={() => setF((x) => ({ ...x, tipo: 'azienda' }))} disabled={busy}>Azienda o professionista</button>
        </div>
        {azienda ? (
          <>
            <Field id="ac-rs" label="Ragione sociale" required error={errs.ragione_sociale}>
              <input id="ac-rs" className="input" autoComplete="organization" value={f.ragione_sociale ?? ''} onChange={(e) => set('ragione_sociale', e.target.value)} disabled={busy} aria-invalid={inv('ragione_sociale')} />
            </Field>
            <div className="grid-2">
              <Field id="ac-piva" label="Partita IVA" required error={errs.partita_iva}>
                <input id="ac-piva" className="input mono" value={f.partita_iva ?? ''} onChange={(e) => set('partita_iva', e.target.value)} disabled={busy} aria-invalid={inv('partita_iva')} />
              </Field>
              <Field id="ac-cfaz" label="Codice fiscale" hint="Se diverso dalla partita IVA.">
                <input id="ac-cfaz" className="input mono" value={f.codice_fiscale ?? ''} onChange={(e) => set('codice_fiscale', e.target.value)} disabled={busy} />
              </Field>
            </div>
            <div className="grid-2">
              <Field id="ac-sdi" label="Codice destinatario (SDI)" error={errs.codice_sdi} hint="7 caratteri; in alternativa la PEC.">
                <input id="ac-sdi" className="input mono" value={f.codice_sdi ?? ''} onChange={(e) => set('codice_sdi', e.target.value)} disabled={busy} aria-invalid={inv('codice_sdi')} />
              </Field>
              <Field id="ac-pec" label="PEC" error={errs.pec}>
                <input id="ac-pec" className="input" type="email" value={f.pec ?? ''} onChange={(e) => set('pec', e.target.value)} disabled={busy} aria-invalid={inv('pec')} />
              </Field>
            </div>
          </>
        ) : (
          <>
            <div className="grid-2">
              <Field id="ac-nome" label="Nome" required error={errs.nome}>
                <input id="ac-nome" className="input" autoComplete="given-name" value={f.nome ?? ''} onChange={(e) => set('nome', e.target.value)} disabled={busy} aria-invalid={inv('nome')} />
              </Field>
              <Field id="ac-cognome" label="Cognome" required error={errs.cognome}>
                <input id="ac-cognome" className="input" autoComplete="family-name" value={f.cognome ?? ''} onChange={(e) => set('cognome', e.target.value)} disabled={busy} aria-invalid={inv('cognome')} />
              </Field>
            </div>
            <Field id="ac-cf" label="Codice fiscale" required error={errs.codice_fiscale} hint="Serve per la fattura e per l’attestato.">
              <input id="ac-cf" className="input mono" value={f.codice_fiscale ?? ''} onChange={(e) => set('codice_fiscale', e.target.value.toUpperCase())} disabled={busy} aria-invalid={inv('codice_fiscale')} maxLength={16} />
            </Field>
          </>
        )}
        <Field id="ac-ind" label="Indirizzo" required error={errs.indirizzo}>
          <input id="ac-ind" className="input" autoComplete="street-address" value={f.indirizzo ?? ''} onChange={(e) => set('indirizzo', e.target.value)} disabled={busy} aria-invalid={inv('indirizzo')} placeholder="Via e numero civico" />
        </Field>
        <div className="acquisto__citta">
          <Field id="ac-cap" label="CAP" required error={errs.cap}>
            <input id="ac-cap" className="input" inputMode="numeric" autoComplete="postal-code" value={f.cap ?? ''} onChange={(e) => set('cap', e.target.value)} disabled={busy} aria-invalid={inv('cap')} maxLength={5} />
          </Field>
          <Field id="ac-citta" label="Città" required error={errs.citta}>
            <input id="ac-citta" className="input" autoComplete="address-level2" value={f.citta ?? ''} onChange={(e) => set('citta', e.target.value)} disabled={busy} aria-invalid={inv('citta')} />
          </Field>
          <Field id="ac-prov" label="Provincia" required error={errs.provincia}>
            <input id="ac-prov" className="input" value={f.provincia ?? ''} onChange={(e) => set('provincia', e.target.value.toUpperCase())} disabled={busy} aria-invalid={inv('provincia')} maxLength={2} placeholder="MI" />
          </Field>
        </div>

        <div className={`field${errs.termini ? ' is-invalid' : ''}`}>
          <label className="check-row">
            <input type="checkbox" checked={termini} onChange={(e) => { setTermini(e.target.checked); if (errs.termini) setErrs((x) => ({ ...x, termini: '' })); }} disabled={busy} aria-invalid={inv('termini')} />
            <span>Accetto i <Link href="/termini" target="_blank">termini e le condizioni di vendita</Link>.</span>
          </label>
          {errs.termini && <div className="field__error" role="alert">{errs.termini}</div>}
        </div>
        <div className={`field${errs.recesso ? ' is-invalid' : ''}`}>
          <label className="check-row">
            <input type="checkbox" checked={recesso} onChange={(e) => { setRecesso(e.target.checked); if (errs.recesso) setErrs((x) => ({ ...x, recesso: '' })); }} disabled={busy} aria-invalid={inv('recesso')} />
            <span>{TESTO_RECESSO}{tipo === 'date' ? ' L’accesso all’area del corso è immediato; gli incontri seguono il calendario dell’edizione.' : ''}</span>
          </label>
          {errs.recesso && <div className="field__error" role="alert">{errs.recesso}</div>}
        </div>

        <button type="submit" className="btn btn--lg btn--block" disabled={busy}>{busy ? 'Ti porto al pagamento…' : 'Vai al pagamento'}</button>
      </div>
    </form>
  );
}
