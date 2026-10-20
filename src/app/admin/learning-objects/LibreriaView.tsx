'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { LearningObjectType, StatoCorso } from '@/lib/db-types';
import { STATO_CORSO_CHIP, STATO_CORSO_LABEL } from '@/lib/db-types';
import { Icon, fmtDurataSec } from '@/components/admin/Atlante';
import { useFeedback } from '@/components/ui/Feedback';
import { useCall } from '@/components/admin/useCall';
import { ErrorBanner } from '@/components/admin/ErrorBanner';

export type ContenutoRow = {
  id: string;
  type: LearningObjectType;
  titolo: string;
  config: Record<string, unknown>;
  archiviato: boolean;
  creato_il: string;
  /** Corsi in cui è una lezione, con la posizione. */
  corsi: { id: string; ordine: number }[];
};
export type CorsoLibreria = { id: string; titolo: string; stato: StatoCorso };

type TipoF = 'tutti' | LearningObjectType;
type StatoF = 'attivi' | 'archiviati' | 'tutti';
type VistaF = 'corsi' | 'elenco';
type SortF = 'recenti' | 'titolo' | 'utilizzo';

const TIPO_LABEL: Record<LearningObjectType, string> = { video: 'Video', documento: 'PDF', quiz: 'Test' };
const TIPO_CHIP: Record<LearningObjectType, string> = { video: 'chip--teal', documento: 'chip--ocra', quiz: 'chip--accent' };
const TIPO_ICON: Record<LearningObjectType, string> = { video: 'video', documento: 'documento', quiz: 'quiz' };

function riferimento(r: ContenutoRow): string {
  if (r.type === 'video') return `Vimeo ${typeof r.config?.vimeo_id === 'string' ? r.config.vimeo_id : '?'}`;
  if (r.type === 'quiz') {
    const s = r.config?.soglia_percentuale;
    return `soglia ${typeof s === 'number' ? s : '?'}%`;
  }
  const f = r.config?.filename;
  return typeof f === 'string' ? f : 'documento.pdf';
}

function dettaglio(r: ContenutoRow): string {
  if (r.type === 'video') { const d = r.config?.durata_secondi; return typeof d === 'number' ? fmtDurataSec(d) : '—'; }
  if (r.type === 'quiz') return '—';
  const size = r.config?.size;
  return typeof size === 'number' ? `${Math.round(size / 1024)} KB` : '—';
}

/**
 * Libreria dei contenuti: vista "per corso" (ogni contenuto sotto i corsi che lo
 * usano, con gli orfani in fondo) oppure elenco; archiviati a richiesta.
 */
export function LibreriaView({ rows, corsi, tabs }: { rows: ContenutoRow[]; corsi: CorsoLibreria[]; tabs?: React.ReactNode }) {
  const { confirm } = useFeedback();
  const { call, busy, error } = useCall();
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState<TipoF>('tutti');
  const [stato, setStato] = useState<StatoF>('attivi');
  const [vista, setVista] = useState<VistaF>('corsi');
  const [sort, setSort] = useState<SortF>('recenti');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (needle && !r.titolo.toLowerCase().includes(needle) && !riferimento(r).toLowerCase().includes(needle)) return false;
      if (tipo !== 'tutti' && r.type !== tipo) return false;
      if (stato === 'attivi' && r.archiviato) return false;
      if (stato === 'archiviati' && !r.archiviato) return false;
      return true;
    });
  }, [rows, q, tipo, stato]);

  const elenco = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      if (sort === 'titolo') return a.titolo.localeCompare(b.titolo, 'it');
      if (sort === 'utilizzo') return b.corsi.length - a.corsi.length;
      return new Date(b.creato_il).getTime() - new Date(a.creato_il).getTime();
    });
    return out;
  }, [filtered, sort]);

  // Vista per corso: gruppi ordinati per stato (attivi, bozze, conclusi) e titolo.
  const gruppi = useMemo(() => {
    const ordineStato: Record<StatoCorso, number> = { attivo: 0, bozza: 1, concluso: 2 };
    const byCorso = new Map<string, { r: ContenutoRow; ordine: number }[]>();
    for (const r of filtered) for (const c of r.corsi) { const arr = byCorso.get(c.id) ?? []; arr.push({ r, ordine: c.ordine }); byCorso.set(c.id, arr); }
    const out = corsi
      .filter((c) => byCorso.has(c.id))
      .sort((a, b) => ordineStato[a.stato] - ordineStato[b.stato] || a.titolo.localeCompare(b.titolo, 'it'))
      .map((c) => ({ corso: c, righe: (byCorso.get(c.id) ?? []).sort((a, b) => a.ordine - b.ordine) }));
    const orfani = filtered.filter((r) => r.corsi.length === 0);
    return { out, orfani };
  }, [filtered, corsi]);

  async function toggleArchive(r: ContenutoRow) {
    if (!r.archiviato) {
      const ok = await confirm({
        titolo: `Archiviare "${r.titolo}"?`,
        messaggio: 'Sparisce dalla libreria e non si potrà aggiungere a nuovi corsi. I corsi che già lo usano continuano a funzionare. Si può ripristinare in qualsiasi momento.',
        conferma: 'Archivia',
      });
      if (!ok) return;
    }
    try {
      await call('POST', `/api/admin/learning-objects/${r.id}/${r.archiviato ? 'unarchive' : 'archive'}`, undefined, { successo: r.archiviato ? `"${r.titolo}" ripristinato.` : `"${r.titolo}" archiviato.` });
    } catch { /* banner */ }
  }

  const Riga = ({ r, ordine, altri }: { r: ContenutoRow; ordine?: number; altri?: number }) => (
    <div className="libitem">
      {ordine != null && <span className="lo-idx">{String(ordine).padStart(2, '0')}</span>}
      <span className={`type-ico type-ico--${r.type}`}><Icon name={TIPO_ICON[r.type]} /></span>
      <div className="libitem__main">
        <div className="libitem__title"><Link href={`/admin/learning-objects/${r.id}`}>{r.titolo}</Link>{r.archiviato && <span className="chip chip--muted" style={{ marginLeft: 8 }}>archiviato</span>}</div>
        <div className="libitem__meta">
          {TIPO_LABEL[r.type]} · {dettaglio(r)} · {riferimento(r)}
          {altri != null && altri > 0 ? ` · anche in ${altri} altr${altri === 1 ? 'o corso' : 'i corsi'}` : ''}
        </div>
      </div>
      {r.corsi.length === 0 && (
        <button type="button" className="btn btn--ghost btn--xs" disabled={busy} onClick={() => toggleArchive(r)}>
          <Icon name="archive" /> {r.archiviato ? 'Ripristina' : 'Archivia'}
        </button>
      )}
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <h1>Corsi</h1>
          <p>La libreria dei contenuti: video, documenti e test che i corsi usano come lezioni. Un contenuto usato in più corsi si corregge una volta sola. Le lezioni si aggiungono di solito dal corso.</p>
        </div>
        <div className="page-head__actions">
          <Link className="btn btn--secondary" href="/admin/learning-objects/new"><Icon name="plus" /> Nuovo contenuto</Link>
        </div>
      </div>
      {tabs}
      <ErrorBanner error={error} />

      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per titolo, file o ID Vimeo" aria-label="Cerca un contenuto" />
        </div>
        <div className="toolbar__spacer" />
        <div className="filterset">
          <div className="seg seg--mono" role="group" aria-label="Vista">
            <button type="button" className={vista === 'corsi' ? 'is-active' : ''} onClick={() => setVista('corsi')}>Per corso</button>
            <button type="button" className={vista === 'elenco' ? 'is-active' : ''} onClick={() => setVista('elenco')}>Elenco</button>
          </div>
          <div className="seg seg--mono" role="group" aria-label="Tipo">
            {(['tutti', 'video', 'documento', 'quiz'] as const).map((t) => (
              <button key={t} type="button" className={tipo === t ? 'is-active' : ''} onClick={() => setTipo(t)}>{t === 'tutti' ? 'Tutti' : TIPO_LABEL[t]}</button>
            ))}
          </div>
          <div className="seg seg--mono" role="group" aria-label="Stato">
            {(['attivi', 'archiviati', 'tutti'] as const).map((s) => (
              <button key={s} type="button" className={stato === s ? 'is-active' : ''} onClick={() => setStato(s)}>{s === 'attivi' ? 'Attivi' : s === 'archiviati' ? 'Archiviati' : 'Tutti'}</button>
            ))}
          </div>
          {vista === 'elenco' && (
            <select className="select" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as SortF)} aria-label="Ordina">
              <option value="recenti">Più recenti</option>
              <option value="titolo">Titolo A–Z</option>
              <option value="utilizzo">Più usati</option>
            </select>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <Icon name="libreria" className="empty__icon" />
          <div className="empty__t">Nessun contenuto</div>
          <div className="empty__s">{rows.length === 0 ? 'La libreria si riempie aggiungendo lezioni ai corsi.' : 'Nessun contenuto corrisponde ai filtri.'}</div>
        </div>
      ) : vista === 'corsi' ? (
        <>
          {gruppi.out.map(({ corso, righe }) => (
            <div key={corso.id} className="card">
              <div className="card__head">
                <div>
                  <h3><Link href={`/admin/corsi/${corso.id}/lezioni`} className="t-link">{corso.titolo}</Link></h3>
                  <div className="sub">{righe.length} {righe.length === 1 ? 'lezione' : 'lezioni'} in libreria</div>
                </div>
                <span className={`chip ${STATO_CORSO_CHIP[corso.stato]}`}>{STATO_CORSO_LABEL[corso.stato]}</span>
              </div>
              <div className="card__body">
                {righe.map(({ r, ordine }) => <Riga key={r.id} r={r} ordine={ordine} altri={r.corsi.length - 1} />)}
              </div>
            </div>
          ))}
          {gruppi.orfani.length > 0 && (
            <div className="card">
              <div className="card__head">
                <div><h3>In nessun corso</h3><div className="sub">Contenuti caricati ma non usati come lezione: si aggiungono dalla scheda Lezioni di un corso, oppure si archiviano.</div></div>
                <span className="chip chip--muted">{gruppi.orfani.length}</span>
              </div>
              <div className="card__body">
                {gruppi.orfani.map((r) => <Riga key={r.id} r={r} />)}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="card">
          <div className="card__body card__body--flush">
            <div className="tbl-wrap"><table className="tbl tbl--zebra">
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>Titolo</th>
                  <th style={{ width: 90 }}>Tipo</th>
                  <th style={{ width: 120 }}>Durata / Peso</th>
                  <th style={{ width: 170 }}>Lezione in</th>
                  <th style={{ width: 110 }}>Stato</th>
                  <th style={{ width: 130 }}></th>
                </tr>
              </thead>
              <tbody>
                {elenco.map((r) => (
                  <tr key={r.id} style={r.archiviato ? { opacity: 0.65 } : undefined}>
                    <td><span className={`type-ico type-ico--${r.type}`}><Icon name={TIPO_ICON[r.type]} /></span></td>
                    <td>
                      <Link href={`/admin/learning-objects/${r.id}`} className="t-title">{r.titolo}</Link>
                      <div className="mono muted" style={{ fontSize: 11 }}>{riferimento(r)}</div>
                    </td>
                    <td><span className={`chip ${TIPO_CHIP[r.type]}`}>{TIPO_LABEL[r.type]}</span></td>
                    <td className="mono">{dettaglio(r)}</td>
                    <td>{r.corsi.length > 0 ? <span className="chip chip--muted">{r.corsi.length} {r.corsi.length === 1 ? 'corso' : 'corsi'}</span> : <span className="muted" style={{ fontSize: 12 }}>nessun corso</span>}</td>
                    <td>{r.archiviato ? <span className="chip chip--muted">Archiviato</span> : <span className="chip chip--ok"><span className="dot" />Attivo</span>}</td>
                    <td>
                      <button type="button" className="btn btn--ghost btn--xs" disabled={busy} onClick={() => toggleArchive(r)}>
                        <Icon name="archive" /> {r.archiviato ? 'Ripristina' : 'Archivia'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </div>
      )}
    </>
  );
}
