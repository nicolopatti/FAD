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
