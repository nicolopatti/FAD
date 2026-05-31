// Primitive UI condivise dell'area amministratore — tema "Atlante".
// Nessun hook / niente 'use client': il modulo è importabile sia da Server
// Component (pagine) sia da Client Component (form interattivi).

import type { CSSProperties } from 'react';

// ── Icone (line icons 24×24, stroke 1.7) portate dal design handoff ─────
export const ICON_PATHS: Record<string, string> = {
  dashboard: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
  corsi: '<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z"/><path d="M19 18v3H6a2 2 0 0 1-2-2"/>',
  libreria: '<rect x="3" y="4" width="4" height="16"/><rect x="9" y="4" width="4" height="16"/><path d="M16 5l4 1-3 14-4-1z"/>',
  sessioni: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
  report: '<path d="M5 3h9l5 5v13H5z"/><path d="M14 3v5h5"/><path d="M9 13v4M12 11v6M15 14v3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M20 16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3"/>',
  video: '<rect x="2" y="5" width="14" height="14" rx="2"/><path d="M16 10l6-3v10l-6-3z"/>',
  documento: '<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/><path d="M9 13h6M9 17h6"/>',
  grip: '<circle cx="9" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3 3 0 0 1 0 5.5M21 20a6 6 0 0 0-4-5.7"/>',
  check: '<path d="M5 12l4.5 4.5L19 7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M4 17l5-5 4 4 3-3 4 4"/>',
  euro: '<path d="M16 6.5A6 6 0 1 0 16 17.5M5 10h7M5 13.5h6"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8"/><path d="M10 12h4"/>',
  snowflake: '<path d="M12 2v20M4.5 6l15 12M19.5 6l-15 12"/><path d="M12 6l-3-2M12 6l3-2M12 18l-3 2M12 18l3 2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  alert: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17.5v.5"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
};

export function Icon({
  name,
  className,
  style,
}: {
  name: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] ?? '' }}
    />
  );
}

// ── Copertina: immagine reale (cover_path → URL pubblico) o segnaposto ──
const CAT_GLYPH: Record<string, string> = {
  SICUREZZA: 'shield',
  PRIVACY: 'lock',
  ANTINCENDIO: 'snowflake',
  'PRIMO SOCCORSO': 'plus',
  FORMAZIONE: 'layers',
};

export function categoriaGlyph(categoria?: string | null): string {
  if (!categoria) return 'layers';
  return CAT_GLYPH[categoria.trim().toUpperCase()] ?? 'layers';
}

export function Cover({
  categoria,
  src,
  className,
  style,
}: {
  categoria?: string | null;
  src?: string | null;
  className?: string;
  style?: CSSProperties;
}) {
  const cls = 'cover' + (className ? ' ' + className : '');
  if (src) {
    return (
      <div className={cls} style={style}>
        {/* copertina caricata dall'utente (bucket pubblico copertine) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" />
      </div>
    );
  }
  const cat = (categoria || 'FORMAZIONE').trim().toUpperCase();
  return (
    <div className={cls} style={style}>
      <div className="cover__glyph">
        <Icon name={categoriaGlyph(cat)} />
      </div>
      <div className="cover__cat">{cat}</div>
    </div>
  );
}

// ── Formattatori condivisi ──────────────────────────────────────────────
export function fmtDurataSec(sec: number | null | undefined): string {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtMinuti(sec: number | null | undefined): string {
  if (sec == null) return '—';
  return `${Math.round(sec / 60)} min`;
}

export function fmtData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDataOra(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  );
}

export function fmtTempoRelativo(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'adesso';
  if (min < 60) return `${min} min fa`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ${h === 1 ? 'ora' : 'ore'} fa`;
  const g = Math.round(h / 24);
  if (g === 1) return 'ieri';
  if (g < 30) return `${g} giorni fa`;
  return fmtData(iso);
}

export function regolaLabel(tipo: string): string {
  if (tipo === 'video_ended') return 'Visione integrale';
  if (tipo === 'documento_completed') return 'Lettura integrale';
  return tipo;
}

// URL pubblico della copertina nel bucket `copertine` (public read).
export function coverUrl(coverPath?: string | null): string | null {
  if (!coverPath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/copertine/${coverPath}`;
}

// Durata video totale (secondi) di una struttura, sommando i config video.
export function durataVideoSecondi(
  items: { type: string; config: Record<string, unknown> }[],
): number {
  return items.reduce((sum, it) => {
    if (it.type !== 'video') return sum;
    const d = it.config?.durata_secondi;
    return sum + (typeof d === 'number' ? d : 0);
  }, 0);
}
