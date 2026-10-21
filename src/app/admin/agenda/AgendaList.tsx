'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/admin/Atlante';
import { Pager } from '@/components/admin/Form';

export type Quando = 'prossime' | 'passate' | 'tutte';
export type SessioneAgenda = {
  id: string; titolo: string; data_ora: string | null; durata_minuti: number | null;
  modalita: 'aula' | 'vcs'; piattaforma: string | null; annullata: boolean;
  corso: string; corso_id: string | null; edizione: string; edizione_id: string | null;
  docente: string | null; coda: number;
};

const PER_PAGINA = 40;
const fmtGiorno = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' });
const fmtOra = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
const giornoKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

export function AgendaList({ righe, quando: iniziale }: { righe: SessioneAgenda[]; quando: Quando }) {
  const router = useRouter();
  const [quando, setQuando] = useState<Quando>(iniziale);
  const [q, setQ] = useState('');
  const [pagina, setPagina] = useState(1);
  // "Adesso" fissato al primo disegno: basta per separare prossime e passate.
  const [now] = useState(() => Date.now());

  const filtrate = useMemo(() => {
    const n = q.trim().toLowerCase();
    const out = righe.filter((s) => {
      const t = s.data_ora ? new Date(s.data_ora).getTime() : null;
      if (quando === 'prossime' && !(t == null || t >= now) ) return false;
      if (quando === 'passate' && !(t != null && t < now)) return false;
      if (n && !`${s.titolo} ${s.corso} ${s.edizione} ${s.docente ?? ''}`.toLowerCase().includes(n)) return false;
      return true;
    });
    out.sort((a, b) => {
      const ta = a.data_ora ? new Date(a.data_ora).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.data_ora ? new Date(b.data_ora).getTime() : Number.MAX_SAFE_INTEGER;
      return quando === 'passate' ? tb - ta : ta - tb;
    });
    return out;
  }, [righe, quando, q, now]);

  const pagine = Math.max(1, Math.ceil(filtrate.length / PER_PAGINA));
  const cur = Math.min(pagina, pagine);
  const visibili = filtrate.slice((cur - 1) * PER_PAGINA, cur * PER_PAGINA);

  // Raggruppo per giorno (le sessioni senza data in fondo).
  const gruppi: { giorno: string | null; etichetta: string; righe: SessioneAgenda[] }[] = [];
  for (const s of visibili) {
    const key = s.data_ora ? giornoKey(s.data_ora) : null;
    const last = gruppi[gruppi.length - 1];
    if (last && last.giorno === key) last.righe.push(s);
    else gruppi.push({ giorno: key, etichetta: s.data_ora ? fmtGiorno.format(new Date(s.data_ora)) : 'Senza data', righe: [s] });
  }
  const href = (s: SessioneAgenda) => (s.corso_id && s.edizione_id ? `/admin/corsi/${s.corso_id}/edizioni/${s.edizione_id}/sessioni/${s.id}` : '/admin/corsi') as Route;

  return (
    <div className="card">
      <div className="card__body">
        <div className="toolbar">
          <div className="search">
            <Icon name="search" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="Cerca per titolo, corso, edizione o docente" aria-label="Cerca una sessione" />
          </div>
          <div className="toolbar__spacer" />
          <div className="seg seg--mono" role="group" aria-label="Quando">
            {([['prossime', 'Prossime'], ['passate', 'Passate'], ['tutte', 'Tutte']] as [Quando, string][]).map(([v, label]) => (
              <button key={v} type="button" className={quando === v ? 'is-active' : ''} onClick={() => { setQuando(v); setPagina(1); }}>{label}</button>
            ))}
          </div>
        </div>

        {visibili.length === 0 ? (
          <div className="empty">
            <Icon name="calendar" className="empty__icon" />
            <div className="empty__t">{righe.length === 0 ? 'Nessuna sessione pianificata' : 'Nessuna sessione corrisponde ai filtri'}</div>
            <div className="empty__s">{righe.length === 0 ? 'Le sessioni si pianificano dalla scheda Sessioni di un\'edizione.' : 'Prova a cambiare periodo o ricerca.'}</div>
          </div>
        ) : (
          gruppi.map((g) => (
            <div key={g.giorno ?? 'senza-data'}>
              <div className="agenda-day">{g.etichetta}</div>
              <div className="tbl-wrap"><table className="tbl tbl--zebra">
                <tbody>
                  {g.righe.map((s) => (
                    <tr key={s.id} className="is-link" onClick={() => router.push(href(s))}>
                      <td className="mono" style={{ width: 70 }}>{s.data_ora ? fmtOra.format(new Date(s.data_ora)) : '—'}</td>
                      <td>
                        <Link className="t-link" href={href(s)} onClick={(e) => e.stopPropagation()}>{s.titolo}</Link>
                        {s.annullata && <span className="chip chip--err" style={{ marginLeft: 8 }}>annullata</span>}
                        <div className="muted" style={{ fontSize: 12 }}>{s.corso} · <span className="mono">{s.edizione}</span></div>
                      </td>
                      <td style={{ width: 150 }}>{s.modalita === 'vcs' ? <span className="chip chip--teal">Webinar · {s.piattaforma ?? '?'}</span> : <span className="chip chip--ocra">Aula</span>}</td>
                      <td className="muted" style={{ width: 90 }}>{s.durata_minuti != null ? `${s.durata_minuti}′` : ''}</td>
                      <td style={{ width: 180 }}>{s.docente ?? <span className="muted">—</span>}</td>
                      <td style={{ width: 150 }}>{s.coda > 0 ? <span className="chip chip--ocra">{s.coda} da riconciliare</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          ))
        )}
        <Pager page={cur} pages={pagine} total={filtrate.length} perPage={PER_PAGINA} onChange={setPagina} cosa="sessioni" />
      </div>
    </div>
  );
}
