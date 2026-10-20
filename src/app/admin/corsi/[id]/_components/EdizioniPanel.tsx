'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { edizioneStato, type EdizioneRow } from '@/lib/db-types';
import { Icon, fmtData } from '@/components/admin/Atlante';
import { Field } from '@/components/admin/Form';
import { useFeedback } from '@/components/ui/Feedback';
import { useCall } from '@/components/admin/useCall';
import { ErrorBanner } from '@/components/admin/ErrorBanner';
import { dataDopo, type Errori } from '@/lib/validazione';
import { edizioneHref } from './shared';

export type EdizioneLista = EdizioneRow & { iscritti: number; sessioni: number; attestati: number };

type EdizioneForm = { codice: string; data_inizio: string; data_fine: string; fad_apertura: string; fad_chiusura: string };
const EDIZIONE_VUOTA: EdizioneForm = { codice: '', data_inizio: '', data_fine: '', fad_apertura: '', fad_chiusura: '' };

function validaEdizione(v: EdizioneForm, edizioni: EdizioneRow[], skipId?: string): Errori {
  const e: Errori = {};
  const codice = v.codice.trim();
  if (!codice) e.codice = 'Indica un codice, es. ED-2026-01.';
  else if (edizioni.some((x) => x.id !== skipId && x.codice.toLowerCase() === codice.toLowerCase())) e.codice = 'Esiste già un\'edizione con questo codice.';
  if (dataDopo(v.data_inizio, v.data_fine)) e.data_fine = 'La fine non può precedere l\'inizio.';
  if (dataDopo(v.fad_apertura, v.fad_chiusura)) e.fad_chiusura = 'La chiusura non può precedere l\'apertura.';
  return e;
}

export function EdizioneCampi({ v, errs, onChange, busy, prefix }: { v: EdizioneForm; errs: Errori; onChange: (v: EdizioneForm) => void; busy: boolean; prefix: string }) {
  const set = (k: keyof EdizioneForm) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...v, [k]: e.target.value });
  return (
    <>
      <Field id={`${prefix}-codice`} label="Codice" required error={errs.codice}>
        <input id={`${prefix}-codice`} className="input mono" value={v.codice} onChange={set('codice')} disabled={busy} placeholder="es. ED-2026-01" aria-invalid={Boolean(errs.codice)} />
      </Field>
      <Field id={`${prefix}-di`} label="Inizio corso">
        <input id={`${prefix}-di`} className="input" type="date" value={v.data_inizio} onChange={set('data_inizio')} disabled={busy} />
      </Field>
      <Field id={`${prefix}-df`} label="Fine corso" error={errs.data_fine}>
        <input id={`${prefix}-df`} className="input" type="date" value={v.data_fine} onChange={set('data_fine')} disabled={busy} aria-invalid={Boolean(errs.data_fine)} />
      </Field>
      <Field id={`${prefix}-fa`} label="Apertura FAD" hint="Da quando le lezioni online sono fruibili.">
        <input id={`${prefix}-fa`} className="input" type="date" value={v.fad_apertura} onChange={set('fad_apertura')} disabled={busy} />
      </Field>
      <Field id={`${prefix}-fc`} label="Chiusura FAD" error={errs.fad_chiusura}>
        <input id={`${prefix}-fc`} className="input" type="date" value={v.fad_chiusura} onChange={set('fad_chiusura')} disabled={busy} aria-invalid={Boolean(errs.fad_chiusura)} />
      </Field>
    </>
  );
}

/** Scheda "Edizioni" del corso: elenco (ogni riga apre la pagina dell'edizione) + nuova edizione. */
export function EdizioniPanel({ corsoId, edizioni, apriNuova = false, archiviato = false }: { corsoId: string; edizioni: EdizioneLista[]; apriNuova?: boolean; archiviato?: boolean }) {
  const router = useRouter();
  const { confirm } = useFeedback();
  const { call, busy, error } = useCall();
  const [creando, setCreando] = useState(false);
  const [nuova, setNuova] = useState<EdizioneForm>(EDIZIONE_VUOTA);
  const [errs, setErrs] = useState<Errori>({});
  const [mostraForm, setMostraForm] = useState(!archiviato && (apriNuova || edizioni.length === 0));
  const [soloAttive, setSoloAttive] = useState(true);

  const nonAttive = edizioni.filter((e) => edizioneStato(e) !== 'attiva').length;
  const visibili = soloAttive && nonAttive > 0 ? edizioni.filter((e) => edizioneStato(e) === 'attiva') : edizioni;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const ve = validaEdizione(nuova, edizioni);
    setErrs(ve);
    if (Object.keys(ve).length) return;
    if (edizioni.length === 0) {
      const ok = await confirm({
        titolo: 'Creare la prima edizione?',
        messaggio: <>Da questo momento il corso è <strong>attivo</strong>: titolo, categoria, regole di fruizione e sequenza delle lezioni non si modificano più, perché le persone iscritte devono seguire sempre lo stesso percorso. Restano modificabili la descrizione, la copertina e i contenuti delle singole lezioni. Non si può tornare indietro.</>,
        conferma: 'Crea la prima edizione',
      });
      if (!ok) return;
    }
    try {
      const res = (await call('POST', `/api/admin/corsi/${corsoId}/edizioni`, {
        codice: nuova.codice.trim(),
        data_inizio: nuova.data_inizio || null, data_fine: nuova.data_fine || null,
        fad_apertura: nuova.fad_apertura || null, fad_chiusura: nuova.fad_chiusura || null,
      }, { successo: `Edizione ${nuova.codice.trim()} creata.`, busy: setCreando })) as { edizione?: { id: string } };
      setNuova(EDIZIONE_VUOTA);
      setMostraForm(false);
      if (res?.edizione?.id) router.push(edizioneHref(corsoId, res.edizione.id));
    } catch {
      /* banner */
    }
  }

  return (
    <>
      <ErrorBanner error={error} />
      <div className="card">
        <div className="card__head">
          <div>
            <h3>Edizioni</h3>
            <div className="sub">Ogni erogazione del corso è un&apos;edizione con codice, date e finestra delle lezioni online. Apri un&apos;edizione per iscritti, sessioni, docenti e fondo.</div>
          </div>
          <div className="row">
            {nonAttive > 0 && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSoloAttive((v) => !v)}>
                {soloAttive ? `Mostra anche ${nonAttive} concluse/annullate` : 'Solo attive'}
              </button>
            )}
            {!mostraForm && !archiviato && (
              <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={() => setMostraForm(true)}><Icon name="plus" /> Nuova edizione</button>
            )}
          </div>
        </div>
        <div className="card__body">
          {edizioni.length === 0 ? (
            <div className="muted" style={{ marginBottom: 14, fontSize: 13 }}>Nessuna edizione: il corso è in bozza e modificabile. La prima edizione lo rende attivo.</div>
          ) : (
            <div className="tbl-wrap"><table className="tbl tbl--zebra" style={{ marginBottom: 16 }}>
              <thead><tr><th>Codice</th><th>Stato</th><th>Date del corso</th><th>Lezioni online</th><th>Iscritti</th><th>Sessioni</th><th>Attestati</th><th></th></tr></thead>
              <tbody>
                {visibili.map((e) => {
                  const stato = edizioneStato(e);
                  const href = edizioneHref(corsoId, e.id);
                  return (
                    <tr key={e.id} className="is-link" onClick={() => router.push(href)}>
                      <td><Link className="t-link mono" href={href} onClick={(ev) => ev.stopPropagation()}>{e.codice}</Link></td>
                      <td>
                        <span className={`chip ${stato === 'attiva' ? 'chip--ok' : stato === 'conclusa' ? 'chip--muted' : 'chip--err'}`}>
                          {stato === 'attiva' && <span className="dot" />}{stato}
                        </span>
                      </td>
                      <td className="muted">{e.data_inizio || e.data_fine ? `${fmtData(e.data_inizio)} → ${fmtData(e.data_fine)}` : '—'}</td>
                      <td className="muted">{e.fad_apertura || e.fad_chiusura ? `${fmtData(e.fad_apertura)} → ${fmtData(e.fad_chiusura)}` : 'sempre aperte'}</td>
                      <td>{e.iscritti}</td>
                      <td>{e.sessioni}</td>
                      <td>{e.attestati}</td>
                      <td><Link className="btn btn--ghost btn--xs" href={href} onClick={(ev) => ev.stopPropagation()}>Apri <Icon name="arrowRight" /></Link></td>
                    </tr>
                  );
                })}
                {visibili.length === 0 && (
                  <tr><td colSpan={8} className="muted">Nessuna edizione attiva.</td></tr>
                )}
              </tbody>
            </table></div>
          )}

          {mostraForm && (
            <form onSubmit={create} noValidate style={{ borderTop: edizioni.length ? '1px dashed var(--line)' : 0, paddingTop: edizioni.length ? 14 : 0 }}>
              <h4 style={{ margin: '0 0 12px' }}>Nuova edizione</h4>
              <div className="grid-3">
                <EdizioneCampi v={nuova} errs={errs} onChange={(v) => { setNuova(v); if (Object.keys(errs).length) setErrs({}); }} busy={busy} prefix="nuova" />
              </div>
              <div className="row">
                <button type="submit" className="btn" disabled={busy}>{creando ? 'Creo…' : edizioni.length === 0 ? 'Crea la prima edizione' : 'Crea edizione'}</button>
                {edizioni.length > 0 && <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => { setMostraForm(false); setErrs({}); }}>Annulla</button>}
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

/** Modifica di codice e date dalla pagina dell'edizione (scheda Stato). */
export function EdizioneModifica({ edizione, altre }: { edizione: EdizioneRow; altre: EdizioneRow[] }) {
  const { call, busy, error } = useCall();
  const [v, setV] = useState<EdizioneForm>({ codice: edizione.codice, data_inizio: edizione.data_inizio ?? '', data_fine: edizione.data_fine ?? '', fad_apertura: edizione.fad_apertura ?? '', fad_chiusura: edizione.fad_chiusura ?? '' });
  const [errs, setErrs] = useState<Errori>({});
  const [salvando, setSalvando] = useState(false);
  const dirty = v.codice.trim() !== edizione.codice || v.data_inizio !== (edizione.data_inizio ?? '') || v.data_fine !== (edizione.data_fine ?? '') || v.fad_apertura !== (edizione.fad_apertura ?? '') || v.fad_chiusura !== (edizione.fad_chiusura ?? '');

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    const ve = validaEdizione(v, [...altre, edizione], edizione.id);
    setErrs(ve);
    if (Object.keys(ve).length) return;
    try {
      await call('PATCH', `/api/admin/edizioni/${edizione.id}`, {
        codice: v.codice.trim(),
        data_inizio: v.data_inizio || null, data_fine: v.data_fine || null,
        fad_apertura: v.fad_apertura || null, fad_chiusura: v.fad_chiusura || null,
      }, { successo: 'Edizione aggiornata.', busy: setSalvando });
    } catch { /* banner */ }
  }

  return (
    <form className="card" onSubmit={salva} noValidate>
      <div className="card__head"><div><h3>Codice e date</h3><div className="sub">La finestra FAD è il periodo in cui le lezioni online sono fruibili; vuota = sempre.</div></div></div>
      <div className="card__body">
        <ErrorBanner error={error} />
        <div className="grid-3">
          <EdizioneCampi v={v} errs={errs} onChange={(x) => { setV(x); if (Object.keys(errs).length) setErrs({}); }} busy={busy || edizioneStato(edizione) === 'annullata'} prefix="ed" />
        </div>
        <button type="submit" className="btn" disabled={busy || !dirty}>{salvando ? 'Salvo…' : 'Salva modifiche'}</button>
      </div>
    </form>
  );
}
