// Filtri del log eventi dell'auditor, condivisi tra la pagina e l'export CSV.
// Si applicano in SQL (PostgREST): il log può avere centinaia di migliaia di
// righe, non si filtra in memoria.

import { GRUPPI, tipiDelGruppo, type GruppoEvento } from './eventi-etichette';

export type FiltriLog = {
  gruppo: GruppoEvento | null;
  tipo: string | null;
  persona: string | null;
  da: string | null; // YYYY-MM-DD (incluso)
  a: string | null; // YYYY-MM-DD (incluso)
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseFiltri(sp: Record<string, string | string[] | undefined> | URLSearchParams): FiltriLog {
  const get = (k: string) => {
    const v = sp instanceof URLSearchParams ? sp.get(k) : sp[k];
    return typeof v === 'string' ? v.trim() : null;
  };
  const gruppo = get('gruppo');
  const tipo = get('tipo');
  const persona = get('persona');
  const da = get('da');
  const a = get('a');
  return {
    gruppo: gruppo && GRUPPI.some((g) => g.id === gruppo) ? (gruppo as GruppoEvento) : null,
    tipo: tipo && /^[a-z_.]{3,60}$/.test(tipo) ? tipo : null,
    persona: persona && UUID.test(persona) ? persona : null,
    da: da && ISO_DATE.test(da) ? da : null,
    a: a && ISO_DATE.test(a) ? a : null,
  };
}

export function filtriAttivi(f: FiltriLog): boolean {
  return Boolean(f.gruppo || f.tipo || f.persona || f.da || f.a);
}

export function filtriQueryString(f: FiltriLog, extra?: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  if (f.gruppo) q.set('gruppo', f.gruppo);
  if (f.tipo) q.set('tipo', f.tipo);
  if (f.persona) q.set('persona', f.persona);
  if (f.da) q.set('da', f.da);
  if (f.a) q.set('a', f.a);
  for (const [k, v] of Object.entries(extra ?? {})) if (v != null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

// Tipo strutturale: basta che il builder esponga questi quattro filtri
// (PostgrestFilterBuilder li restituisce come `this`).
type Q = {
  eq(colonna: string, valore: string): Q;
  in(colonna: string, valori: string[]): Q;
  gte(colonna: string, valore: string): Q;
  lte(colonna: string, valore: string): Q;
};

// Offset di Europe/Rome per una data (ora legale compresa), es. "+02:00".
export function offsetRoma(data: string): string {
  const d = new Date(`${data}T12:00:00Z`);
  const parte = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', timeZoneName: 'longOffset' })
    .formatToParts(d)
    .find((p) => p.type === 'timeZoneName')?.value;
  const off = (parte ?? 'GMT+01:00').replace('GMT', '');
  return off || '+00:00';
}

// Muta il builder (i filtri PostgREST restituiscono `this`): si chiama e poi
// si continua con lo stesso oggetto. Niente generici: il tipo del builder
// Supabase manda in loop l'inferenza di TypeScript (TS2589).
export function applicaFiltri(builder: unknown, f: FiltriLog): void {
  // `unknown` + cast interno: il confronto strutturale col tipo del builder
  // Supabase farebbe esplodere l'inferenza anche senza generici.
  const query = builder as Q;
  if (f.tipo) query.eq('event_type', f.tipo);
  else if (f.gruppo) query.in('event_type', tipiDelGruppo(f.gruppo));
  if (f.persona) query.eq('actor->>persona_id', f.persona);
  // Le date sono giorni interi nel fuso di Roma (l'auditor legge l'ora locale).
  if (f.da) query.gte('occurred_at', `${f.da}T00:00:00${offsetRoma(f.da)}`);
  if (f.a) query.lte('occurred_at', `${f.a}T23:59:59.999${offsetRoma(f.a)}`);
}

// bytea via PostgREST arriva in base64 (o "\x…" via psql): → esadecimale.
export function bytesToHex(input: unknown): string {
  if (typeof input !== 'string' || input.length === 0) return '';
  if (input.startsWith('\\x')) return input.slice(2);
  try {
    const decoded = Buffer.from(input, 'base64');
    return decoded.length > 0 ? decoded.toString('hex') : input;
  } catch {
    return input;
  }
}
