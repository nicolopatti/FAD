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
