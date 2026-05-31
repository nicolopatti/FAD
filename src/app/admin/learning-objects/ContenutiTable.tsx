'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { LearningObjectType } from '@/lib/db-types';
import { Icon, fmtDurataSec } from '@/components/admin/Atlante';

export type ContenutoRow = {
  id: string;
  type: LearningObjectType;
  titolo: string;
  config: Record<string, unknown>;
  archiviato: boolean;
  creato_il: string;
  usato_in: number;
};

type TipoF = 'tutti' | 'video' | 'documento';
type StatoF = 'attivi' | 'archiviati' | 'tutti';
type SortF = 'recenti' | 'titolo' | 'utilizzo';

function riferimento(r: ContenutoRow): string {
  if (r.type === 'video') {
    const id = r.config?.vimeo_id;
    return `vimeo · ${typeof id === 'string' ? id : '?'}`;
  }
  const f = r.config?.filename;
  return typeof f === 'string' ? f : 'documento.pdf';
}

function durataCol(r: ContenutoRow): string {
  if (r.type === 'video') {
    const d = r.config?.durata_secondi;
    return fmtDurataSec(typeof d === 'number' ? d : null);
  }
  const size = r.config?.size;
  const kb = typeof size === 'number' ? Math.round(size / 1024) : null;
  return kb != null ? `${kb} KB` : '—';
}

export function ContenutiTable({ rows }: { rows: ContenutoRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState<TipoF>('tutti');
  const [stato, setStato] = useState<StatoF>('attivi');
  const [sort, setSort] = useState<SortF>('recenti');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (needle && !r.titolo.toLowerCase().includes(needle) && !riferimento(r).toLowerCase().includes(needle)) return false;
      if (tipo !== 'tutti' && r.type !== tipo) return false;
      if (stato === 'attivi' && r.archiviato) return false;
      if (stato === 'archiviati' && !r.archiviato) return false;
      return true;
    });
    out.sort((a, b) => {
      if (sort === 'titolo') return a.titolo.localeCompare(b.titolo, 'it');
      if (sort === 'utilizzo') return b.usato_in - a.usato_in;
      return new Date(b.creato_il).getTime() - new Date(a.creato_il).getTime();
    });
    return out;
  }, [rows, q, tipo, stato, sort]);

  async function toggleArchive(r: ContenutoRow) {
    setBusy(r.id);
    setError(null);
    try {
      const url = `/api/admin/learning-objects/${r.id}/${r.archiviato ? 'unarchive' : 'archive'}`;
      const res = await fetch(url, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <h1>Contenuti</h1>
          <p>Libreria degli oggetti didattici riutilizzabili (video e documenti) del tenant.</p>
        </div>
        <div className="page-head__actions">
          <Link className="btn" href="/admin/learning-objects/new">
            <Icon name="plus" /> Nuovo contenuto
          </Link>
        </div>
      </div>

      {error && <div className="banner banner--err"><Icon name="alert" className="banner__icon" /><div className="banner__body">{error}</div></div>}

      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per titolo o riferimento" />
        </div>
        <div className="toolbar__spacer" />
        <div className="filterset">
          <Seg value={tipo} onChange={(v) => setTipo(v as TipoF)} options={[['tutti', 'Tutti'], ['video', 'Video'], ['documento', 'PDF']]} />
          <Seg value={stato} onChange={(v) => setStato(v as StatoF)} options={[['attivi', 'Attivi'], ['archiviati', 'Archiviati'], ['tutti', 'Tutti']]} />
          <select className="select" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as SortF)}>
            <option value="recenti">Più recenti</option>
            <option value="titolo">Titolo A–Z</option>
            <option value="utilizzo">Più utilizzati</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <Icon name="libreria" className="empty__icon" />
          <div className="empty__t">Nessun contenuto</div>
          <div className="empty__s">Nessun oggetto didattico corrisponde ai filtri correnti.</div>
        </div>
      ) : (
        <div className="card">
          <div className="card__body card__body--flush">
          <table className="tbl tbl--zebra">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Titolo</th>
                <th style={{ width: 90 }}>Tipo</th>
                <th style={{ width: 120 }}>Durata / Peso</th>
                <th style={{ width: 150 }}>Utilizzo</th>
                <th style={{ width: 110 }}>Stato</th>
                <th style={{ width: 130 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} style={r.archiviato ? { opacity: 0.65 } : undefined}>
                  <td>
                    <span className={`type-ico type-ico--${r.type}`}>
                      <Icon name={r.type === 'video' ? 'video' : 'documento'} />
                    </span>
                  </td>
                  <td>
                    <Link href={`/admin/learning-objects/${r.id}`} className="t-title">{r.titolo}</Link>
                    <div className="mono muted" style={{ fontSize: 11 }}>{riferimento(r)}</div>
                  </td>
                  <td><span className={`chip ${r.type === 'video' ? 'chip--teal' : 'chip--ocra'}`}>{r.type === 'video' ? 'Video' : 'PDF'}</span></td>
                  <td className="mono">{durataCol(r)}</td>
                  <td>
                    {r.usato_in > 0 ? (
                      <span className="chip chip--muted">Usato in {r.usato_in} {r.usato_in === 1 ? 'corso' : 'corsi'}</span>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>Non utilizzato</span>
                    )}
                  </td>
                  <td>
                    {r.archiviato
                      ? <span className="chip chip--muted">Archiviato</span>
                      : <span className="chip chip--teal"><span className="dot" />Attivo</span>}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn--ghost btn--xs"
                      disabled={busy === r.id}
                      onClick={() => toggleArchive(r)}
                    >
                      <Icon name="archive" />
                      {r.archiviato ? 'Ripristina' : 'Archivia'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
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
