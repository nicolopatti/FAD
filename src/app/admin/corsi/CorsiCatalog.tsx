'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon, Cover, coverUrl, fmtMinuti } from '@/components/admin/Atlante';

export type CorsoCard = {
  id: string;
  titolo: string;
  descrizione: string | null;
  categoria: string | null;
  cover_path: string | null;
  sblocco_sequenziale: boolean;
  creato_il: string;
  n_oggetti: number;
  n_edizioni: number;
  durata_sec: number;
  congelato: boolean;
};

type StatoF = 'tutti' | 'bozza' | 'congelati';
type EdiF = 'tutte' | 'con' | 'senza';
type SortF = 'recenti' | 'titolo' | 'oggetti';

export function CorsiCatalog({ corsi }: { corsi: CorsoCard[] }) {
  const [q, setQ] = useState('');
  const [stato, setStato] = useState<StatoF>('tutti');
  const [edi, setEdi] = useState<EdiF>('tutte');
  const [sort, setSort] = useState<SortF>('recenti');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = corsi.filter((c) => {
      if (needle && !`${c.titolo} ${c.descrizione ?? ''}`.toLowerCase().includes(needle)) return false;
      if (stato === 'bozza' && c.congelato) return false;
      if (stato === 'congelati' && !c.congelato) return false;
      if (edi === 'con' && c.n_edizioni === 0) return false;
      if (edi === 'senza' && c.n_edizioni > 0) return false;
      return true;
    });
    out.sort((a, b) => {
      if (sort === 'titolo') return a.titolo.localeCompare(b.titolo, 'it');
      if (sort === 'oggetti') return b.n_oggetti - a.n_oggetti;
      return new Date(b.creato_il).getTime() - new Date(a.creato_il).getTime();
    });
    return out;
  }, [corsi, q, stato, edi, sort]);

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <h1>Corsi</h1>
          <p>
            Catalogo dei percorsi formativi. Ogni corso raccoglie oggetti didattici e può essere
            erogato in più edizioni.
          </p>
        </div>
        <div className="page-head__actions">
          <Link className="btn" href="/admin/corsi/new">
            <Icon name="plus" /> Nuovo corso
          </Link>
        </div>
      </div>

      {corsi.length === 0 ? (
        <div className="empty">
          <Icon name="corsi" className="empty__icon" />
          <div className="empty__t">Nessun corso ancora</div>
          <div className="empty__s">Crea il primo corso per comporre la struttura didattica e aprirne le edizioni.</div>
          <div className="empty__action">
            <Link className="btn" href="/admin/corsi/new"><Icon name="plus" /> Nuovo corso</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <div className="search">
              <Icon name="search" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per titolo o descrizione" />
            </div>
            <div className="toolbar__spacer" />
            <div className="filterset">
              <Seg
                value={stato}
                onChange={(v) => setStato(v as StatoF)}
                options={[['tutti', 'Tutti'], ['bozza', 'Bozza'], ['congelati', 'Congelati']]}
              />
              <Seg
                value={edi}
                onChange={(v) => setEdi(v as EdiF)}
                options={[['tutte', 'Edizioni'], ['con', 'Con'], ['senza', 'Senza']]}
              />
              <select className="select" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as SortF)}>
                <option value="recenti">Più recenti</option>
                <option value="titolo">Titolo A–Z</option>
                <option value="oggetti">Più oggetti</option>
              </select>
            </div>
          </div>

          <div className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
            {filtered.length} {filtered.length === 1 ? 'corso' : 'corsi'}
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
                      <span className={`chip ${c.congelato ? 'chip--freeze' : 'chip--ocra'}`}>
                        <span className="dot" />
                        {c.congelato ? 'Congelato' : 'Bozza'}
                      </span>
                    </div>
                    {c.descrizione && <div className="course-card__desc">{c.descrizione}</div>}
                    <div className="course-card__foot">
                      <span className="metaline"><Icon name="layers" /> <span className="num">{c.n_oggetti}</span> oggetti</span>
                      <span className="metaline"><Icon name="calendar" /> <span className="num">{c.n_edizioni}</span> edizioni</span>
                      {c.durata_sec > 0 && (
                        <span className="metaline"><Icon name="clock" /> {fmtMinuti(c.durata_sec)}</span>
                      )}
                      {c.sblocco_sequenziale && <span className="chip chip--muted">Sblocco sequenziale</span>}
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

function Seg({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="seg seg--mono">
      {options.map(([v, label]) => (
        <button key={v} type="button" className={value === v ? 'is-active' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}
