'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { IncaricoConPersona, SessioneRow } from '@/lib/db-types';
import { Icon, fmtDataOra } from '@/components/admin/Atlante';
import { NewSessioneForm } from './NewSessioneForm';
import { sessioneHref } from '../../../_components/shared';

export type SessioneLista = SessioneRow & { docente: string | null; coda: number; presenze: number };

/** Scheda "Sessioni" dell'edizione: elenco + pianificazione. */
export function SessioniList({ corsoId, edizioneId, attiva, sessioni, docenti }: { corsoId: string; edizioneId: string; attiva: boolean; sessioni: SessioneLista[]; docenti: IncaricoConPersona[] }) {
  const router = useRouter();
  const [nuova, setNuova] = useState(sessioni.length === 0 && attiva);
  const [now] = useState(() => Date.now()); // fissato al primo disegno
  const stato = (s: SessioneLista) => s.annullato_at ? 'annullata' : s.coda > 0 ? 'da riconciliare' : s.data_ora && new Date(s.data_ora).getTime() > now ? 'pianificata' : s.presenze > 0 ? 'presenze registrate' : 'senza presenze';

  return (
    <>
      <div className="card">
        <div className="card__head">
          <div><h3>Sessioni</h3><div className="sub">Webinar e incontri in aula di questa edizione. Apri una sessione per importare le presenze, risolvere la coda e correggere a mano.</div></div>
          {attiva && !nuova && <button type="button" className="btn btn--sm" onClick={() => setNuova(true)}><Icon name="plus" /> Pianifica sessione</button>}
        </div>
        <div className="card__body">
          {sessioni.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>{attiva ? 'Nessuna sessione pianificata. Se il corso è solo online, questa scheda può restare vuota.' : 'Nessuna sessione.'}</div>
          ) : (
            <div className="tbl-wrap"><table className="tbl tbl--zebra">
              <thead><tr><th>Titolo</th><th>Quando</th><th>Modalità</th><th>Docente</th><th>Stato</th><th></th></tr></thead>
              <tbody>
                {sessioni.map((s) => {
                  const href = sessioneHref(corsoId, edizioneId, s.id);
                  const st = stato(s);
                  return (
                    <tr key={s.id} className="is-link" onClick={() => router.push(href)}>
                      <td><Link className="t-link" href={href} onClick={(e) => e.stopPropagation()}>{s.titolo}</Link></td>
                      <td className="muted">{fmtDataOra(s.data_ora)}{s.durata_minuti != null && ` · ${s.durata_minuti}′`}</td>
                      <td>{s.modalita === 'vcs' ? <span className="chip chip--teal">Webinar · {s.vcs_piattaforma ?? '?'}</span> : <span className="chip chip--ocra">Aula</span>}</td>
                      <td>{s.docente ?? <span className="muted">—</span>}</td>
                      <td>
                        <span className={`chip ${st === 'annullata' ? 'chip--err' : st === 'da riconciliare' ? 'chip--ocra' : st === 'presenze registrate' ? 'chip--ok' : 'chip--muted'}`}>
                          {st}{st === 'da riconciliare' ? ` (${s.coda})` : st === 'presenze registrate' ? ` (${s.presenze})` : ''}
                        </span>
                      </td>
                      <td><Link className="btn btn--ghost btn--xs" href={href} onClick={(e) => e.stopPropagation()}>Apri <Icon name="arrowRight" /></Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </div>
      </div>
      {nuova && attiva && <NewSessioneForm corsoId={corsoId} edizioneId={edizioneId} docenti={docenti} onChiudi={sessioni.length > 0 ? () => setNuova(false) : undefined} />}
    </>
  );
}
