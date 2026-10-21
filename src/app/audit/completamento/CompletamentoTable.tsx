'use client';

import { useMemo, useState } from 'react';
import { Icon, fmtDataOra } from '@/components/admin/Atlante';
import { Pager } from '@/components/admin/Form';

export type LoRiga = {
  struttura_id: string;
  ordine: number;
  titolo: string;
  tipo: string;
  obbligatorio: boolean;
  regola: string;
  integrale: boolean;
  copertura: number | null;
  stato: 'ok' | 'da_fare' | 'bloccato';
  completato_il: string | null;
  quiz: { tentativi: number; migliore: number | null; ultima: number | null; superato: boolean } | null;
};

const TIPO_LABEL: Record<string, string> = { video: 'Video', documento: 'Documento', quiz: 'Test finale' };

export type RigaCompletamento = {
  iscrizione_id: string;
  persona: { nome: string; cognome: string; email: string } | null;
  corso: string | null;
  corso_id: string | null;
  edizione: string | null;
  totale: number;
  completati: number;
  obbligatori_totale: number;
  obbligatori_completati: number;
  idonea: boolean;
  frequenza: { percentuale: number; soglia: number; ore: number; ore_pianificate: number; idoneo: boolean; non_parsate: number } | null;
  presenze: number;
  attestato: { id: string; numero: string; emesso_at: string; automatico: boolean } | null;
  items: LoRiga[];
};

type Stato = 'tutti' | 'idonei' | 'in_corso';
const PER_PAGINA = 25;

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function CompletamentoTable({ righe }: { righe: RigaCompletamento[] }) {
  const [q, setQ] = useState('');
  const [corso, setCorso] = useState('');
  const [stato, setStato] = useState<Stato>('tutti');
  const [pagina, setPagina] = useState(1);
  const [aperte, setAperte] = useState<Set<string>>(new Set());

  const corsi = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of righe) if (r.corso_id && r.corso) m.set(r.corso_id, r.corso);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], 'it'));
  }, [righe]);

  const filtrate = useMemo(() => {
    const n = q.trim().toLowerCase();
    return righe.filter((r) => {
      if (corso && r.corso_id !== corso) return false;
      if (stato === 'idonei' && !r.idonea) return false;
      if (stato === 'in_corso' && r.idonea) return false;
      if (n && !`${r.persona?.cognome ?? ''} ${r.persona?.nome ?? ''} ${r.persona?.email ?? ''} ${r.corso ?? ''} ${r.edizione ?? ''}`.toLowerCase().includes(n)) return false;
      return true;
    });
  }, [righe, q, corso, stato]);

  const tot = {
    iscrizioni: filtrate.length,
    idonei: filtrate.filter((r) => r.idonea).length,
    inCorso: filtrate.filter((r) => !r.idonea).length,
    sottoSoglia: filtrate.filter((r) => r.frequenza && !r.frequenza.idoneo).length,
  };

  const pagine = Math.max(1, Math.ceil(filtrate.length / PER_PAGINA));
  const cur = Math.min(pagina, pagine);
  const visibili = filtrate.slice((cur - 1) * PER_PAGINA, cur * PER_PAGINA);

  function toggle(id: string) {
    setAperte((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function scaricaCsv() {
    const head = ['cognome', 'nome', 'email', 'corso', 'edizione', 'lezioni_completate', 'lezioni_totali', 'obbligatorie_completate', 'obbligatorie_totali', 'idoneita', 'frequenza_percentuale', 'soglia', 'ore_frequentate'];
    const rows = filtrate.map((r) => [
      r.persona?.cognome ?? '', r.persona?.nome ?? '', r.persona?.email ?? '', r.corso ?? '', r.edizione ?? '',
      r.completati, r.totale, r.obbligatori_completati, r.obbligatori_totale, r.idonea ? 'idoneo' : 'in corso',
      r.frequenza ? r.frequenza.percentuale : '', r.frequenza ? r.frequenza.soglia : '', r.frequenza ? r.frequenza.ore : '',
    ].map(csvCell).join(';'));
    const blob = new Blob(['﻿' + [head.join(';'), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `completamento-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <nav className="kpi-strip" aria-label="Totali">
        <div className="kpi-strip__item"><span className="kpi-strip__label"><Icon name="users" /> Iscrizioni</span><span className="kpi-strip__value">{tot.iscrizioni}</span><span className="kpi-strip__sub">{righe.length !== tot.iscrizioni ? `su ${righe.length} totali` : 'nel registro'}</span></div>
        <div className="kpi-strip__item"><span className="kpi-strip__label"><Icon name="check" /> Idonei</span><span className="kpi-strip__value">{tot.idonei}</span><span className="kpi-strip__sub">lezioni obbligatorie e presenza minima</span></div>
        <div className="kpi-strip__item"><span className="kpi-strip__label"><Icon name="clock" /> In corso</span><span className="kpi-strip__value">{tot.inCorso}</span><span className="kpi-strip__sub">percorso non ancora concluso</span></div>
        <div className="kpi-strip__item"><span className="kpi-strip__label"><Icon name="alert" /> Frequenza sotto soglia</span><span className="kpi-strip__value">{tot.sottoSoglia}</span><span className="kpi-strip__sub">solo corsi con sessioni</span></div>
      </nav>

      <section className="card">
        <div className="card__head">
          <div>
            <h3>Iscrizioni</h3>
            <div className="sub">Stato ricalcolato adesso dagli eventi del registro, non da colonne salvate.</div>
          </div>
          <button type="button" className="btn btn--secondary btn--sm" onClick={scaricaCsv} disabled={filtrate.length === 0}><Icon name="download" /> Esporta CSV</button>
        </div>
        <div className="card__body">
          <div className="toolbar">
            <div className="search">
              <Icon name="search" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="Cerca per nome, email, corso" aria-label="Cerca" />
            </div>
            <select className="select" style={{ width: 'auto', maxWidth: 320 }} value={corso} onChange={(e) => { setCorso(e.target.value); setPagina(1); }} aria-label="Corso">
              <option value="">Tutti i corsi</option>
              {corsi.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
            </select>
            <div className="toolbar__spacer" />
            <div className="seg seg--mono" role="group" aria-label="Stato">
              {([['tutti', 'Tutti'], ['idonei', 'Idonei'], ['in_corso', 'In corso']] as [Stato, string][]).map(([v, l]) => (
                <button key={v} type="button" className={stato === v ? 'is-active' : ''} onClick={() => { setStato(v); setPagina(1); }}>{l}</button>
              ))}
            </div>
          </div>

          {visibili.length === 0 ? (
            <div className="muted" style={{ padding: '12px 0' }}>Nessuna iscrizione corrisponde ai filtri.</div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl log-tbl">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}><span className="sr-only">Dettaglio</span></th>
                    <th>Discente</th>
                    <th>Corso / Edizione</th>
                    <th>Lezioni</th>
                    <th>Idoneità</th>
                    <th>Frequenza</th>
                    <th>Attestato</th>
                  </tr>
                </thead>
                <tbody>
                  {visibili.map((r) => {
                    const open = aperte.has(r.iscrizione_id);
                    const pct = r.totale > 0 ? Math.round((r.completati / r.totale) * 100) : 0;
                    return (
                      <RigaView key={r.iscrizione_id} r={r} open={open} pct={pct} onToggle={() => toggle(r.iscrizione_id)} />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={cur} pages={pagine} total={filtrate.length} perPage={PER_PAGINA} onChange={setPagina} cosa="iscrizioni" />
        </div>
      </section>
    </>
  );
}

function RigaView({ r, open, pct, onToggle }: { r: RigaCompletamento; open: boolean; pct: number; onToggle: () => void }) {
  return (
    <>
      <tr className={`log-row${open ? ' is-open' : ''}`}>
        <td>
          <button type="button" className="log-toggle" aria-expanded={open} aria-controls={`isc-${r.iscrizione_id}`} aria-label={open ? 'Chiudi dettaglio lezioni' : 'Apri dettaglio lezioni'} onClick={onToggle} disabled={r.items.length === 0}>
            <Icon name="chevronRight" />
          </button>
        </td>
        <td>
          {r.persona ? <><div className="t-title">{r.persona.cognome} {r.persona.nome}</div><div className="muted log-sub">{r.persona.email}</div></> : <span className="muted">—</span>}
        </td>
        <td>
          <div>{r.corso ?? <span className="muted">—</span>}</div>
          <div className="muted log-sub mono">{r.edizione ?? '—'}</div>
        </td>
        <td>
          {r.totale > 0 ? (
            <div className="compl-prog">
              <span className="compl-prog__n">{r.completati} di {r.totale}</span>
              <span className="progress" style={{ width: 90 }}><span className={`progress__bar ${r.idonea ? 'is-ok' : ''}`} style={{ width: `${pct}%` }} /></span>
              <span className="muted log-sub">obbligatorie {r.obbligatori_completati}/{r.obbligatori_totale}</span>
            </div>
          ) : <span className="muted">nessuna lezione online</span>}
        </td>
        <td>{r.idonea ? <span className="chip chip--ok"><span className="dot" />idoneo</span> : <span className="chip chip--accent">in corso</span>}</td>
        <td>
          {r.frequenza ? (
            <>
              <span className={`chip ${r.frequenza.idoneo ? 'chip--ok' : 'chip--err'}`}>{r.frequenza.percentuale}%</span>
              <div className="muted log-sub">soglia {r.frequenza.soglia}% · {r.frequenza.ore} h su {r.frequenza.ore_pianificate} h{r.frequenza.non_parsate > 0 ? ` · ${r.frequenza.non_parsate} durate non lette` : ''}</div>
            </>
          ) : r.presenze > 0 ? <span className="muted">{r.presenze} presenze</span> : <span className="muted">—</span>}
        </td>
        <td>
          {r.attestato ? (
            <>
              <a className="mono" href={`/api/attestati/${r.attestato.id}/pdf`} target="_blank" rel="noreferrer" title="Apri il PDF">n. {r.attestato.numero}</a>
              <div className="muted log-sub">del {fmtDataOra(r.attestato.emesso_at)} · {r.attestato.automatico ? 'automatico' : 'manuale'}</div>
            </>
          ) : <span className="muted">—</span>}
        </td>
      </tr>
      {open && (
        <tr className="log-detail" id={`isc-${r.iscrizione_id}`}>
          <td />
          <td colSpan={5}>
            <ol className="compl-lo">
              {r.items.map((it) => (
                <li key={it.struttura_id} className={`compl-lo__row is-${it.stato}`}>
                  <span className="compl-lo__n">{it.ordine}</span>
                  <span className="compl-lo__main">
                    <span className="compl-lo__t">{it.titolo}</span>
                    <span className="muted log-sub">
                      {TIPO_LABEL[it.tipo] ?? it.tipo} · {it.obbligatorio ? 'obbligatoria' : 'facoltativa'} · {it.regola}{it.integrale && it.tipo === 'video' ? ' (≥ 95% riprodotto)' : ''}
                      {it.copertura != null ? ` · visto ${it.copertura}%` : ''}
                      {it.quiz ? ` · ${it.quiz.tentativi} tentativ${it.quiz.tentativi === 1 ? 'o' : 'i'}${it.quiz.migliore != null ? `, migliore ${it.quiz.migliore}%` : ''}${it.quiz.superato ? ' (superato)' : ''}` : ''}
                      {it.completato_il ? ` · completata il ${fmtDataOra(it.completato_il)}` : ''}
                    </span>
                  </span>
                  <span className="compl-lo__stato">
                    {it.stato === 'ok' ? <span className="chip chip--ok">completata</span> : it.stato === 'da_fare' ? <span className="chip chip--accent">da fare</span> : <span className="chip chip--muted">bloccata</span>}
                  </span>
                </li>
              ))}
            </ol>
          </td>
        </tr>
      )}
    </>
  );
}
