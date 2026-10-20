'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { SessioneConEdizione } from '@/lib/db-types';
import { Icon, fmtDataOra } from '@/components/admin/Atlante';
import { Pager } from '@/components/admin/Form';

export type Quando = 'tutte' | 'prossime' | 'passate' | 'annullate';
const PER_PAGINA = 20;

export function SessioniTable({ sessioni, quandoIniziale = 'tutte' }: { sessioni: SessioneConEdizione[]; quandoIniziale?: Quando }) {
  const [q, setQ] = useState('');
  const [quando, setQuando] = useState<Quando>(quandoIniziale);
  const [pagina, setPagina] = useState(1);

  const filtrate = useMemo(() => {
    const now = Date.now();
    const n = q.trim().toLowerCase();
    const out = sessioni.filter((s) => {
      if (quando === 'annullate') { if (!s.annullato_at) return false; }
      else if (s.annullato_at && quando !== 'tutte') return false;
      if (quando === 'prossime' && !(s.data_ora && new Date(s.data_ora).getTime() >= now)) return false;
      if (quando === 'passate' && !(s.data_ora && new Date(s.data_ora).getTime() < now)) return false;
      if (n && !`${s.titolo} ${s.edizione?.corso?.titolo ?? ''} ${s.edizione?.codice ?? ''} ${s.vcs_piattaforma ?? ''}`.toLowerCase().includes(n)) return false;
      return true;
    });
    // Le prossime in ordine cronologico, le altre dalla più recente.
    out.sort((a, b) => {
      const ta = a.data_ora ? new Date(a.data_ora).getTime() : 0;
      const tb = b.data_ora ? new Date(b.data_ora).getTime() : 0;
      return quando === 'prossime' ? ta - tb : tb - ta;
    });
    return out;
  }, [sessioni, q, quando]);

  const pagine = Math.max(1, Math.ceil(filtrate.length / PER_PAGINA));
  const cur = Math.min(pagina, pagine);
  const visibili = filtrate.slice((cur - 1) * PER_PAGINA, cur * PER_PAGINA);

  return (
    <div className="card">
      <div className="card__head">
        <h3>Sessioni pianificate</h3>
        <span className="chip chip--muted">{sessioni.length} {sessioni.length === 1 ? 'sessione' : 'sessioni'}</span>
      </div>
      <div className="card__body">
        {sessioni.length === 0 ? (
          <div className="muted">Nessuna sessione ancora pianificata: usa il modulo qui sotto.</div>
        ) : (
          <>
            <div className="toolbar">
              <div className="search">
                <Icon name="search" />
                <input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="Cerca per titolo, corso o edizione" aria-label="Cerca una sessione" />
              </div>
              <div className="toolbar__spacer" />
              <div className="seg seg--mono" role="group" aria-label="Quando">
                {([['tutte', 'Tutte'], ['prossime', 'Prossime'], ['passate', 'Passate'], ['annullate', 'Annullate']] as [Quando, string][]).map(([v, label]) => (
                  <button key={v} type="button" className={quando === v ? 'is-active' : ''} onClick={() => { setQuando(v); setPagina(1); }}>{label}</button>
                ))}
              </div>
            </div>

            {visibili.length === 0 ? (
              <div className="muted" style={{ padding: '12px 0' }}>Nessuna sessione corrisponde ai filtri.</div>
            ) : (
              <div className="tbl-wrap"><table className="tbl tbl--zebra">
                <thead>
                  <tr>
                    <th>Titolo</th>
                    <th>Corso / Edizione</th>
                    <th>Quando</th>
                    <th style={{ width: 150 }}>Modalità</th>
                    <th style={{ width: 90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {visibili.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/admin/sessioni/${s.id}`} className="t-title" style={{ textDecoration: 'none' }}>{s.titolo}</Link>
                        {s.annullato_at && <span className="chip chip--err" style={{ marginLeft: 8 }}>annullata</span>}
                      </td>
                      <td className="muted">
                        {s.edizione?.corso?.titolo ?? '—'}
                        {s.edizione?.codice && <span className="mono"> · {s.edizione.codice}</span>}
                      </td>
                      <td className="muted">
                        {fmtDataOra(s.data_ora)}
                        {s.durata_minuti != null && ` · ${s.durata_minuti}′`}
                      </td>
                      <td>
                        {s.modalita === 'vcs'
                          ? <span className="chip chip--teal">Webinar · {s.vcs_piattaforma ?? '?'}</span>
                          : <span className="chip chip--ocra">Aula</span>}
                      </td>
                      <td>
                        <Link className="btn btn--ghost btn--xs" href={`/admin/sessioni/${s.id}`}>Apri <Icon name="arrowRight" /></Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
            <Pager page={cur} pages={pagine} total={filtrate.length} perPage={PER_PAGINA} onChange={setPagina} cosa="sessioni" />
          </>
        )}
      </div>
    </div>
  );
}
