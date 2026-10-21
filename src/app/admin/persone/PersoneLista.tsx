'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PersonaRiepilogo } from '@/lib/db-types';
import { Icon, fmtData } from '@/components/admin/Atlante';
import { useFeedback } from '@/components/ui/Feedback';
import { useCall } from '@/components/admin/useCall';
import { ErrorBanner } from '@/components/admin/ErrorBanner';
import { BulkBar, PagerUrl, RicercaUrl, SegUrl } from '@/components/admin/Lista';

export type AccessoF = 'tutti' | 'si' | 'no';

/** Lista delle persone con filtri nell'URL e invito in blocco. */
const RUOLO_ACCESSO: Record<string, string> = { admin: 'amministratore', auditor: 'auditor' };

export function PersoneLista({ righe, totale, pagina, perPagina, q, senzaAccesso, totalePersone, ruoli = {} }: {
  righe: PersonaRiepilogo[]; totale: number; pagina: number; perPagina: number; q: string; senzaAccesso: number; totalePersone: number;
  /** persona_id → ruolo di accesso (app_metadata.role), solo per chi ha l'accesso. */
  ruoli?: Record<string, string>;
}) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const { call, busy, error } = useCall();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const selezionate = righe.filter((r) => sel.has(r.id));
  const tutteSel = righe.length > 0 && righe.every((r) => sel.has(r.id));

  async function invita() {
    const da = selezionate.filter((p) => !p.accesso);
    if (!da.length) { toast('Le persone selezionate hanno già un accesso.', 'errore'); return; }
    if (!(await confirm({ titolo: `Inviare l'invito a ${da.length} ${da.length === 1 ? 'persona' : 'persone'}?`, messaggio: 'Ognuna riceve un\'email con il link per scegliere la password. Chi ha già un accesso non viene toccato.', conferma: 'Invia gli inviti' }))) return;
    let inviati = 0; let primoErrore: string | null = null;
    for (const p of da) {
      try { await call('POST', `/api/admin/persone/${p.id}/invita`); inviati += 1; }
      catch (err) { if (!primoErrore) primoErrore = `${p.email}: ${err instanceof Error ? err.message : String(err)}`; }
    }
    if (primoErrore) toast(`${inviati} inviti inviati, ${da.length - inviati} non riusciti: ${primoErrore}`, 'errore');
    else toast(`${inviati} invit${inviati === 1 ? 'o inviato' : 'i inviati'}.`);
    setSel(new Set());
  }

  return (
    <>
      <ErrorBanner error={error} />
      <div className="toolbar">
        <RicercaUrl placeholder="Cerca per cognome, nome, email o codice fiscale" label="Cerca una persona" />
        <div className="toolbar__spacer" />
        <div className="filterset">
          <SegUrl param="accesso" predefinito="tutti" label="Accesso" opzioni={[{ v: 'tutti', label: `Tutte (${totalePersone})` }, { v: 'si', label: `Con accesso (${totalePersone - senzaAccesso})` }, { v: 'no', label: `Da invitare (${senzaAccesso})` }]} />
          <SegUrl param="ruolo" predefinito="tutti" label="Ruolo" opzioni={[{ v: 'tutti', label: 'Tutti i ruoli' }, { v: 'docenti', label: 'Docenti e tutor' }, { v: 'senza', label: 'Senza iscrizioni' }]} />
        </div>
      </div>

      <BulkBar n={selezionate.length} cosa={selezionate.length === 1 ? 'persona selezionata' : 'persone selezionate'} onAzzera={() => setSel(new Set())}>
        <button type="button" className="btn btn--sm" disabled={busy} onClick={invita}><Icon name="users" /> Invita chi non ha accesso</button>
      </BulkBar>

      {righe.length === 0 ? (
        <div className="empty">
          <Icon name="users" className="empty__icon" />
          <div className="empty__t">{q ? `Nessuna persona per “${q}”` : 'Nessuna persona'}</div>
          <div className="empty__s">Le persone si aggiungono iscrivendole a un&apos;edizione o assegnando un incarico.</div>
        </div>
      ) : (
        <div className="card">
          <div className="card__body card__body--flush">
            <div className="tbl-wrap"><table className="tbl tbl--zebra tbl--lista">
              <thead>
                <tr>
                  <th className="t-check"><input type="checkbox" checked={tutteSel} onChange={() => setSel(tutteSel ? new Set() : new Set(righe.map((r) => r.id)))} aria-label="Seleziona tutte le persone della pagina" /></th>
                  <th>Cognome e nome</th><th>Email</th><th>Accesso</th><th>Codice fiscale</th><th>Iscrizioni</th><th>Attestati</th><th>Ruolo</th><th>Ultima iscrizione</th><th></th>
                </tr>
              </thead>
              <tbody>
                {righe.map((p) => {
                  const href = `/admin/persone/${p.id}` as const;
                  return (
                    <tr key={p.id} className={`is-link${sel.has(p.id) ? ' is-selected' : ''}`} onClick={() => router.push(href)}>
                      <td className="t-check" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(p.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} aria-label={`Seleziona ${p.cognome} ${p.nome}`} /></td>
                      <td className="t-title"><Link className="t-link" href={href} onClick={(e) => e.stopPropagation()}>{p.cognome} {p.nome}</Link></td>
                      <td className="muted">{p.email}</td>
                      <td>{p.accesso ? <span className="chip chip--ok">attivo</span> : <span className="chip chip--ocra">da invitare</span>}</td>
                      <td className="mono">{p.codice_fiscale ?? <span className="muted">—</span>}</td>
                      <td>{p.n_iscrizioni}</td>
                      <td className="muted">{p.n_attestati || '—'}</td>
                      <td>
                        {RUOLO_ACCESSO[ruoli[p.id]] && <span className="chip chip--accent">{RUOLO_ACCESSO[ruoli[p.id]]}</span>}
                        {p.n_incarichi > 0 && <span className="chip chip--teal">docente/tutor</span>}
                        {!RUOLO_ACCESSO[ruoli[p.id]] && p.n_incarichi === 0 && <span className="muted">{p.n_iscrizioni > 0 ? 'discente' : '—'}</span>}
                      </td>
                      <td className="muted">{p.ultima_iscrizione_il ? fmtData(p.ultima_iscrizione_il) : '—'}</td>
                      <td><Link className="btn btn--ghost btn--xs" href={href} onClick={(e) => e.stopPropagation()}>Apri <Icon name="arrowRight" /></Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </div>
        </div>
      )}
      <PagerUrl pagina={pagina} totale={totale} perPagina={perPagina} cosa="persone" />
    </>
  );
}
