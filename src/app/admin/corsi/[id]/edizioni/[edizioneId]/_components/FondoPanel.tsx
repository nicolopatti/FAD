'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { Icon } from '@/components/admin/Atlante';
import { Field } from '@/components/admin/Form';
import { useFeedback } from '@/components/ui/Feedback';
import { useCall } from '@/components/admin/useCall';
import { ErrorBanner } from '@/components/admin/ErrorBanner';

export type PianoFondo = { id: string; titolo: string; codice: string | null; fondo: string | null; cup: string | null; iscritti: number };

/** Scheda "Fondo" dell'edizione: piano finanziato per tutti gli iscritti, eccezioni e collegamento alla rendicontazione. */
export function FondoPanel({ corsoId, edizioneId, attiva, piani, nIscritti, senzaPiano, soglia }: { corsoId: string; edizioneId: string; attiva: boolean; piani: PianoFondo[]; nIscritti: number; senzaPiano: number; soglia: number | null }) {
  const { confirm } = useFeedback();
  const { call, busy, error } = useCall();
  const [pianoId, setPianoId] = useState(piani.length === 1 ? piani[0].id : '');
  const [salvando, setSalvando] = useState(false);
  const conPiano = piani.filter((p) => p.iscritti > 0);

  async function assegna() {
    const piano = piani.find((p) => p.id === pianoId);
    const ok = await confirm({
      titolo: piano ? `Assegnare "${piano.titolo}" a tutti gli iscritti?` : 'Togliere il piano finanziato a tutti gli iscritti?',
      messaggio: piano ? `Tutti i ${nIscritti} iscritti dell'edizione passano a questo piano, anche chi ne aveva un altro. Le eccezioni per singolo iscritto si fanno nella scheda Iscritti.` : `Nessuno dei ${nIscritti} iscritti avrà più un piano finanziato.`,
      conferma: piano ? 'Assegna a tutti' : 'Togli a tutti',
    });
    if (!ok) return;
    try {
      await call('POST', `/api/admin/edizioni/${edizioneId}/piano`, { piano_id: pianoId || null }, { successo: piano ? `Piano "${piano.titolo}" assegnato a ${nIscritti} iscritti.` : 'Piano tolto a tutti gli iscritti.', busy: setSalvando });
    } catch { /* banner */ }
  }

  return (
    <>
      <ErrorBanner error={error} />
      <div className="grid-2-380">
        <div>
          <div className="card">
            <div className="card__head"><div><h3>Piano finanziato dell&apos;edizione</h3><div className="sub">Il piano lega gli iscritti al fondo che finanzia il corso (Fondimpresa, FonCoop…). Si assegna a tutti in una volta; le eccezioni per singolo iscritto si fanno nella scheda Iscritti.</div></div></div>
            <div className="card__body">
              {conPiano.length === 0 ? (
                <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>{nIscritti === 0 ? 'Nessun iscritto ancora: iscrivi le persone, poi assegna il piano.' : 'Nessun iscritto ha un piano finanziato: edizione a mercato (nessuna rendicontazione).'}</div>
              ) : (
                <div className="tbl-wrap"><table className="tbl tbl--zebra" style={{ marginBottom: 14 }}>
                  <thead><tr><th>Piano</th><th>Fondo</th><th>CUP</th><th>Iscritti</th><th></th></tr></thead>
                  <tbody>
                    {conPiano.map((p) => (
                      <tr key={p.id}>
                        <td className="t-title">{p.titolo}{p.codice && <span className="mono muted"> · {p.codice}</span>}</td>
                        <td>{p.fondo ?? <span className="muted">—</span>}</td>
                        <td>{p.cup ? <span className="mono">{p.cup}</span> : <span className="chip chip--err">assente</span>}</td>
                        <td>{p.iscritti} su {nIscritti}</td>
                        <td><Link className="btn btn--ghost btn--xs" href={`/admin/rendicontazione?edizione=${edizioneId}&piano=${p.id}` as Route}>Rendicontazione <Icon name="arrowRight" /></Link></td>
                      </tr>
                    ))}
                    {senzaPiano > 0 && <tr><td colSpan={5} className="muted">{senzaPiano} iscritt{senzaPiano === 1 ? 'o' : 'i'} senza piano (a mercato).</td></tr>}
                  </tbody>
                </table></div>
              )}
              {attiva && nIscritti > 0 && (
                <div className="row row--wrap" style={{ alignItems: 'flex-end', gap: 12 }}>
                  <Field id="fondo-piano" label="Assegna a tutti gli iscritti" hint={piani.length === 0 ? 'Nessun piano nel tenant: crealo in Rendicontazione.' : undefined} className="field--inline">
                    <select id="fondo-piano" className="select" value={pianoId} onChange={(e) => setPianoId(e.target.value)} disabled={busy || piani.length === 0} style={{ minWidth: 260 }}>
                      <option value="">— nessun piano —</option>
                      {piani.map((p) => <option key={p.id} value={p.id}>{p.titolo}{p.fondo ? ` (${p.fondo})` : ''}</option>)}
                    </select>
                  </Field>
                  <button type="button" className="btn" disabled={busy || piani.length === 0} onClick={assegna} style={{ marginBottom: 14 }}>{salvando ? 'Assegno…' : 'Assegna a tutti'}</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div>
          <div className="card">
            <div className="card__head"><h3>Per la rendicontazione</h3></div>
            <div className="card__body">
              <ul className="ready">
                <li className={conPiano.length > 0 ? 'is-ok' : 'is-todo'}><span className="ready__dot"><Icon name={conPiano.length > 0 ? 'check' : 'euro'} /></span>Piano assegnato agli iscritti</li>
                <li className={conPiano.every((p) => p.cup) && conPiano.length > 0 ? 'is-ok' : 'is-todo'}><span className="ready__dot"><Icon name={conPiano.every((p) => p.cup) && conPiano.length > 0 ? 'check' : 'alert'} /></span>
                  <span>CUP del piano: <strong>obbligatorio</strong> per il deposito{conPiano.some((p) => !p.cup) && <> · <Link href="/admin/rendicontazione">completa il piano</Link></>}</span>
                </li>
                <li className={soglia != null ? 'is-ok' : ''}><span className="ready__dot"><Icon name={soglia != null ? 'check' : 'clock'} /></span>
                  <span>Presenza minima alle sessioni{soglia != null ? `: ${soglia}%` : <>: nessun requisito. Si sceglie nelle <Link href={`/admin/corsi/${corsoId}/impostazioni` as Route}>impostazioni del corso</Link> prima della prima edizione; per questo corso è ormai fissata.</>}</span>
                </li>
              </ul>
              <div className="field__hint" style={{ marginTop: 12 }}>I codici fiscali mancanti si vedono nella scheda Iscritti; la rendicontazione li segnala come bloccanti. <Link href="/admin/rendicontazione">Vai a Rendicontazione</Link> per piani, anteprima e deposito.</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
