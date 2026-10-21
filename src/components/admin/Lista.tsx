'use client';

// Primitive per le liste filtrate e paginate SUL SERVER (ondata C): i filtri
// vivono nell'URL (`?q=&stato=&pagina=`), così la pagina è condivisibile, il
// tasto indietro funziona e il Server Component carica solo le righe della
// pagina. Ricerca con attesa di 300 ms, segmenti e paginatore come link.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Icon } from './Atlante';

import { PER_PAGINA } from '@/lib/paginazione';

export function useFiltriUrl() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const params = useSearchParams();
  const attuale = params?.toString() ?? '';
  // Identità stabile (dipende solo da indirizzo e filtri): così gli effetti che la
  // usano (es. l'attesa della ricerca) non ripartono a ogni render.
  const href = useCallback((cambia: Record<string, string | null | undefined>, azzeraPagina = true): Route => {
    const next = new URLSearchParams(attuale);
    for (const [k, v] of Object.entries(cambia)) {
      if (v == null || v === '') next.delete(k); else next.set(k, v);
    }
    if (azzeraPagina) next.delete('pagina');
    const qs = next.toString();
    return (qs ? `${pathname}?${qs}` : pathname) as Route;
  }, [attuale, pathname]);
  const set = useCallback((cambia: Record<string, string | null | undefined>, azzeraPagina = true) => { router.replace(href(cambia, azzeraPagina)); }, [href, router]);
  return { params, href, set };
}

/** Casella di ricerca legata a `?q=` con attesa di 300 ms. */
export function RicercaUrl({ placeholder, label }: { placeholder: string; label: string }) {
  const { params, set } = useFiltriUrl();
  const iniziale = params?.get('q') ?? '';
  const [q, setQ] = useState(iniziale);
  const ultimo = useRef(iniziale);
  // Se l'URL cambia da fuori (link, indietro), la casella si riallinea.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setQ(iniziale); ultimo.current = iniziale; }, [iniziale]);
  useEffect(() => {
    if (q === ultimo.current) return;
    const t = setTimeout(() => { ultimo.current = q; set({ q: q.trim() || null }); }, 300);
    return () => clearTimeout(t);
  }, [q, set]);
  return (
    <div className="search">
      <Icon name="search" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={label} />
      {q && <button type="button" className="search__clear" aria-label="Azzera la ricerca" onClick={() => setQ('')}><Icon name="x" /></button>}
    </div>
  );
}

/** Segmenti (Tutti / Attivi / …) come link che impostano `?param=`. */
export function SegUrl({ param, opzioni, predefinito, label, mono = true }: { param: string; opzioni: { v: string; label: ReactNode }[]; predefinito: string; label: string; mono?: boolean }) {
  const { params, href } = useFiltriUrl();
  const attuale = params?.get(param) ?? predefinito;
  return (
    <div className={`seg${mono ? ' seg--mono' : ''}`} role="group" aria-label={label}>
      {opzioni.map((o) => (
        <Link key={o.v} href={href({ [param]: o.v === predefinito ? null : o.v })} className={attuale === o.v ? 'is-active' : ''} aria-current={attuale === o.v ? 'true' : undefined}>{o.label}</Link>
      ))}
    </div>
  );
}

/** Selettore (categoria, ordine…) legato a `?param=`. */
export function SelectUrl({ param, opzioni, predefinito, label, vuoto }: { param: string; opzioni: { v: string; label: string }[]; predefinito?: string; label: string; vuoto?: string }) {
  const { params, set } = useFiltriUrl();
  const attuale = params?.get(param) ?? predefinito ?? '';
  return (
    <select className="select" style={{ width: 'auto' }} value={attuale} onChange={(e) => set({ [param]: e.target.value === (predefinito ?? '') ? null : e.target.value })} aria-label={label}>
      {vuoto != null && <option value="">{vuoto}</option>}
      {opzioni.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  );
}

/** Paginatore come link (`?pagina=`), con il conteggio totale dal server. */
export function PagerUrl({ pagina, totale, perPagina = PER_PAGINA, cosa = 'righe' }: { pagina: number; totale: number; perPagina?: number; cosa?: string }) {
  const { href } = useFiltriUrl();
  if (totale === 0) return null;
  const pagine = Math.max(1, Math.ceil(totale / perPagina));
  const da = (pagina - 1) * perPagina + 1;
  const a = Math.min(totale, pagina * perPagina);
  return (
    <div className="pager">
      <span className="pager__info">{totale <= perPagina ? `${totale} ${cosa}` : `${da}–${a} di ${totale} ${cosa}`}</span>
      {pagine > 1 && (
        <span className="pager__nav">
          {pagina > 1 ? <Link className="icon-btn" aria-label="Pagina precedente" href={href({ pagina: pagina - 1 > 1 ? String(pagina - 1) : null }, false)}>‹</Link> : <button type="button" className="icon-btn" disabled aria-label="Pagina precedente">‹</button>}
          <span className="pager__page">{pagina} / {pagine}</span>
          {pagina < pagine ? <Link className="icon-btn" aria-label="Pagina successiva" href={href({ pagina: String(pagina + 1) }, false)}>›</Link> : <button type="button" className="icon-btn" disabled aria-label="Pagina successiva">›</button>}
        </span>
      )}
    </div>
  );
}

/** Barra delle azioni in blocco: compare quando c'è almeno una riga selezionata. */
export function BulkBar({ n, cosa, onAzzera, children }: { n: number; cosa: string; onAzzera: () => void; children: ReactNode }) {
  if (n === 0) return null;
  return (
    <div className="bulkbar" role="region" aria-label="Azioni sulla selezione">
      <span className="bulkbar__n"><strong>{n}</strong> {cosa}</span>
      <div className="bulkbar__actions">{children}</div>
      <button type="button" className="btn btn--ghost btn--xs" onClick={onAzzera}><Icon name="x" /> Annulla selezione</button>
    </div>
  );
}
