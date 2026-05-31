// Formattazione condivisa degli eventi del player per la vista "Stream eventi".
// Funzioni pure (niente React): usate sia server-side (eventi storici dal log)
// sia client-side (eventi emessi live dal player nella sessione).

export type StreamEvent = { t: string; e: string; d: string };

export function fmtSec(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(1) : '—';
}

/** Dettaglio leggibile (colonna `pl`) a partire dal payload dell'evento. */
export function formatEventDetail(
  eventType: string,
  payload: Record<string, unknown> | null | undefined,
): string {
  const p = payload ?? {};
  switch (eventType) {
    case 'video.play':
    case 'video.pause':
      return `pos=${fmtSec(p.posizione_secondi)}`;
    case 'video.seek':
      return `${fmtSec(p.from_secondi)}→${fmtSec(p.to_secondi)}`;
    case 'video.ended':
      return `durata=${fmtSec(p.durata_secondi)}`;
    case 'documento.opened':
      return typeof p.filename === 'string' ? p.filename : 'apertura';
    case 'documento.completed':
      return 'lettura completata';
    default:
      return '';
  }
}

/** HH:MM:SS deterministico da un timestamp ISO (per gli eventi storici). */
export function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '··:··:··';
  return d.toLocaleTimeString('it-IT', { hour12: false });
}
