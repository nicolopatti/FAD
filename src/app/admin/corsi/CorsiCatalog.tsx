'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { STATO_CORSO_CHIP, STATO_CORSO_LABEL, type StatoCorso } from '@/lib/db-types';
import { Icon, Cover, coverUrl, fmtMinuti } from '@/components/admin/Atlante';

export type CorsoCard = {
  id: string;
  titolo: string;
  descrizione: string | null;
  categoria: string | null;
  cover_path: string | null;
  sblocco_sequenziale: boolean;
  visione_integrale: boolean;
  creato_il: string;
  n_lezioni: number;
  n_edizioni: number;
  n_edizioni_attive: number;
  n_iscritti: number;
  durata_sec: number;
  stato: StatoCorso;
};

export type StatoF = 'tutti' | StatoCorso;
type SortF = 'recenti' | 'titolo' | 'iscritti';

export function CorsiCatalog({ corsi, statoIniziale = 'tutti' }: { corsi: CorsoCard[]; statoIniziale?: StatoF }) {
  const [q, setQ] = useState('');
  const [stato, setStato] = useState<StatoF>(statoIniziale);
  const [sort, setSort] = useState<SortF>('recenti');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = corsi.filter((c) => {
      if (needle && !`${c.titolo} ${c.descrizione ?? ''} ${c.categoria ?? ''}`.toLowerCase().includes(needle)) return false;
      if (stato !== 'tutti' && c.stato !== stato) return false;
      return true;
    });
    out.sort((a, b) => {
      if (sort === 'titolo') return a.titolo.localeCompare(b.titolo, 'it');
      if (sort === 'iscritti') return b.n_iscritti - a.n_iscritti;
      return new Date(b.creato_il).getTime() - new Date(a.creato_il).getTime();
    });
    return out;
  }, [corsi, q, stato, sort]);

  const conta = (s: StatoCorso) => corsi.filter((c) => c.stato === s).length;

  return (
    <>
      {corsi.length === 0 ? (
        <div className="empty">
          <Icon name="corsi" className="empty__icon" />
          <div className="empty__t">Nessun corso ancora</div>
          <div className="empty__s">Crea il primo corso: lezioni, poi la prima edizione con gli iscritti.</div>
          <div className="empty__action">
            <Link className="btn" href="/admin/corsi/new"><Icon name="plus" /> Nuovo corso</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <div className="search">
              <Icon name="search" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per titolo, descrizione o categoria" aria-label="Cerca un corso" />
            </div>
            <div className="toolbar__spacer" />
            <div className="filterset">
              <div className="seg seg--mono" role="group" aria-label="Stato">
                {([['tutti', `Tutti (${corsi.length})`], ['attivo', `Attivi (${conta('attivo')})`], ['bozza', `Bozze (${conta('bozza')})`], ['concluso', `Conclusi (${conta('concluso')})`]] as [StatoF, string][]).map(([v, label]) => (
                  <button key={v} type="button" className={stato === v ? 'is-active' : ''} onClick={() => setStato(v)}>{label}</button>
                ))}
              </div>
              <select className="select" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as SortF)} aria-label="Ordina">
                <option value="recenti">Più recenti</option>
                <option value="titolo">Titolo A–Z</option>
                <option value="iscritti">Più iscritti</option>
              </select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="empty">
              <Icon name="search" className="empty__icon" />
              <div className="empty__t">Nessun corso corrisponde ai filtri</div>
              <div className="empty__s">Prova a modificare la ricerca o ad azzerare i filtri.</div>
            </div>
          ) : (
            <div className="course-grid">
              {filtered.map((c) => (
                <Link key={c.id} href={`/admin/corsi/${c.id}`} className="course-card">
                  <Cover categoria={c.categoria} src={coverUrl(c.cover_path)} />
                  <div className="course-card__body">
                    <div className="course-card__head">
                      <h3 className="course-card__title">{c.titolo}</h3>
                      <span className={`chip ${STATO_CORSO_CHIP[c.stato]}`}>
                        {c.stato === 'attivo' && <span className="dot" />}
                        {STATO_CORSO_LABEL[c.stato]}
                      </span>
                    </div>
                    {c.descrizione && <div className="course-card__desc">{c.descrizione}</div>}
                    <div className="course-card__foot">
                      <span className="metaline"><Icon name="layers" /> <span className="num">{c.n_lezioni}</span> lezioni</span>
                      <span className="metaline"><Icon name="calendar" /> <span className="num">{c.n_edizioni_attive}</span> {c.n_edizioni_attive === 1 ? 'edizione attiva' : 'edizioni attive'}</span>
                      <span className="metaline"><Icon name="users" /> <span className="num">{c.n_iscritti}</span> iscritti</span>
                      {c.durata_sec > 0 && <span className="metaline"><Icon name="clock" /> {fmtMinuti(c.durata_sec)}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
