// Validatori leggeri per i form (lato client e server). Messaggi in italiano,
// pensati per stare accanto al campo.

/**
 * Soglia di frequenza in percentuale (0 < x ≤ 100, virgola ammessa). Vuoto =
 * nessun requisito (null). Ritorna undefined se il valore non è valido.
 */
export function parseSoglia(v: unknown): number | null | undefined {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.').trim());
  if (!Number.isFinite(n) || n <= 0 || n > 100) return undefined;
  return Math.round(n * 100) / 100;
}

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

// Codice fiscale italiano: 16 caratteri nel formato persone fisiche. Controllo
// strutturale (niente carattere di controllo: basta a intercettare refusi).
export function isCodiceFiscale(v: string): boolean {
  return /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/i.test(v.trim());
}

// "mm:ss" oppure secondi interi → secondi; null se non valido.
export function parseMmSs(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(\d+):([0-5]?\d)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// Le date ISO (YYYY-MM-DD) si confrontano come stringhe.
export function dataDopo(a: string, b: string): boolean {
  return Boolean(a && b && b < a);
}

export type Errori = Record<string, string>;

export function primoErrore(e: Errori): string | null {
  const k = Object.keys(e)[0];
  return k ? e[k] : null;
}

/** Nome confrontabile: minuscolo, senza accenti, apostrofi e spazi doppi. */
export function normalizzaNome(v: string | null | undefined): string {
  return (v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’`.-]/g, ' ').replace(/\s+/g, ' ').trim();
}

export type MotivoConflitto = 'nome' | 'codice_fiscale' | 'codice_fiscale_nuovo';

/**
 * Iscrizione con un'email già in anagrafica (A4, stress test 21/10): i dati
 * scritti corrispondono alla persona trovata? Nome e cognome devono coincidere
 * (anche invertiti); un codice fiscale diverso è un conflitto, e uno nuovo su
 * una persona che non l'ha va comunque confermato prima di copiarlo.
 */
export function conflittiIdentita(
  scritto: { nome: string; cognome: string; codice_fiscale: string | null },
  esistente: { nome: string | null; cognome: string | null; codice_fiscale: string | null },
): MotivoConflitto[] {
  const out: MotivoConflitto[] = [];
  const n = normalizzaNome(scritto.nome), c = normalizzaNome(scritto.cognome);
  const en = normalizzaNome(esistente.nome), ec = normalizzaNome(esistente.cognome);
  if (!((n === en && c === ec) || (n === ec && c === en))) out.push('nome');
  const cf = (scritto.codice_fiscale ?? '').trim().toUpperCase();
  const ecf = (esistente.codice_fiscale ?? '').trim().toUpperCase();
  if (cf && ecf && cf !== ecf) out.push('codice_fiscale');
  else if (cf && !ecf) out.push('codice_fiscale_nuovo');
  return out;
}

export type DateEdizione = { data_inizio?: string | null; data_fine?: string | null; fad_apertura?: string | null; fad_chiusura?: string | null };

/**
 * Coerenza delle date di un'edizione (B1, stress test 21/10). Chiavi = campi
 * del form. Ammesso: lezioni online aperte PRIMA dell'inizio del corso
 * (materiale preparatorio). Non ammesso: fine prima dell'inizio, chiusura FAD
 * prima dell'apertura, FAD che apre o chiude dopo la fine del corso, FAD che
 * chiude prima che il corso inizi.
 */
export function erroriDateEdizione(d: DateEdizione): Errori {
  const e: Errori = {};
  const di = d.data_inizio || '', df = d.data_fine || '', fa = d.fad_apertura || '', fc = d.fad_chiusura || '';
  if (dataDopo(di, df)) e.data_fine = 'La fine non può precedere l’inizio.';
  if (dataDopo(fa, fc)) e.fad_chiusura = 'La chiusura non può precedere l’apertura.';
  if (dataDopo(fa, df)) e.fad_apertura = 'Le lezioni online non possono aprire dopo la fine del corso.';
  if (!e.fad_chiusura && dataDopo(fc, df)) e.fad_chiusura = 'Le lezioni online non possono chiudere dopo la fine del corso.';
  if (!e.fad_chiusura && dataDopo(di, fc)) e.fad_chiusura = 'Le lezioni online non possono chiudere prima che il corso inizi.';
  return e;
}

/** Ore totali del corso (0 < x ≤ 9999, virgola ammessa). Vuoto = null; undefined se non valido. */
export function parseOre(v: unknown): number | null | undefined {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.').trim());
  if (!Number.isFinite(n) || n <= 0 || n > 9999) return undefined;
  return n;
}

export const MSG_ORE = 'Le ore totali devono essere un numero maggiore di zero (es. 8 o 2,5).';

/** Prima lettera maiuscola (messaggi di errore tecnici mostrati all'utente). */
export function maiuscola(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Secondi → "mm:ss" (inverso di parseMmSs). */
export function fmtMmSs(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
