// Fase 3 — Task 3: adattatore CSV. Parser tollerante + mappatura colonne
// configurabile → shape normalizzata comune (la STESSA che produrrà l'adattatore
// API Teams del Task 6). Nessuna dipendenza esterna.
//
// L'adattatore NON tocca il grezzo: trasforma il testo CSV in un array di righe
// normalizzate e fallisce con un errore ESPLICITO se manca una colonna chiave
// (brief Task 3) — la scrittura del grezzo è solo della pipeline (Task 2).
//
// Le righe normalizzate conservano i valori "come ricevuti" (D20): nessun parsing
// di durata/timestamp qui — è la riconciliazione (Task 4) a interpretarli.

export type CanonicalKey = 'nome' | 'email' | 'join' | 'leave' | 'durata';

export type NormalizedRow = {
  riga: number; // indice 1-based della riga-dati nel file (riferimento stabile)
  nome: string;
  email: string | null;
  join: string | null;
  leave: string | null;
  durata: string | null; // valore grezzo "come ricevuto"
};

export type ColumnMapping = Partial<Record<CanonicalKey, string>>;

export class CsvAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvAdapterError';
  }
}

// Colonne che DEVONO esistere nell'intestazione. Le celle possono essere vuote
// (es. partecipante anonimo senza email: caso gestito dal Task 4). 'join'/'leave'
// sono opzionali (Teams/Zoom li hanno, ma la durata da sola basta alla frequenza).
const REQUIRED_KEYS: CanonicalKey[] = ['nome', 'email', 'durata'];

// Varianti di intestazione comuni Teams/Zoom (IT/EN), confrontate normalizzate.
const HEADER_ALIASES: Record<CanonicalKey, string[]> = {
  nome: [
    'name', 'full name', 'display name', 'nome', 'nome completo',
    'nome e cognome', 'cognome e nome', 'partecipante', 'participant',
    'utente', 'user name', 'username',
  ],
  email: [
    'email', 'e-mail', 'email address', 'indirizzo email', 'indirizzo e-mail',
    'posta elettronica', 'user email', 'upn', 'user principal name',
  ],
  join: [
    'join time', 'first join', 'first join time', 'join date/time',
    'orario di partecipazione', 'ora di ingresso', 'ingresso', 'orario ingresso', 'join',
  ],
  leave: [
    'leave time', 'last leave', 'last leave time', 'leave date/time',
    'orario di uscita', 'ora di uscita', 'uscita', 'orario uscita', 'leave',
  ],
  durata: [
    'duration', 'in-meeting duration', 'in meeting duration', 'attendance duration',
    'duration (minutes)', 'durata', 'durata (minuti)', 'durata in minuti',
    'tempo di partecipazione', 'minuti',
  ],
};

const ALL_KEYS: CanonicalKey[] = ['nome', 'email', 'join', 'leave', 'durata'];

// Strip di un eventuale BOM (UTF-8/UTF-16) in testa alla stringa, senza usare
// un literal invisibile nel sorgente (codepoint U+FEFF).
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function normHeader(h: string): string {
  return stripBom(h).trim().toLowerCase().replace(/\s+/g, ' ');
}

// Delimitatore più probabile sulla prima riga non vuota (CSV `,`, IT `;`, TSV tab).
function detectDelimiter(firstLine: string): string {
  const candidates = [',', ';', '\t'];
  let best = ',';
  let bestCount = -1;
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

// Parser CSV/TSV con campi tra virgolette e "" come escape, robusto a CRLF/LF/CR.
export function parseDelimited(text: string): { headers: string[]; rows: string[][] } {
  const clean = stripBom(text);
  const firstLine = clean.split(/\r\n|\n|\r/).find((l) => l.trim().length > 0) ?? '';
  if (!firstLine) throw new CsvAdapterError('Il file CSV è vuoto.');
  const delim = detectDelimiter(firstLine);

  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;
  const pushField = () => { record.push(field); field = ''; };
  const pushRecord = () => { records.push(record); record = []; };

  while (i < clean.length) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === delim) { pushField(); i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { pushField(); pushRecord(); i++; continue; }
    field += ch; i++;
  }
  if (field.length > 0 || record.length > 0) { pushField(); pushRecord(); }

  const nonEmpty = records.filter((r) => r.some((c) => c.trim().length > 0));
  if (nonEmpty.length === 0) throw new CsvAdapterError('Il file CSV non contiene righe.');

  const headers = nonEmpty[0].map((h) => stripBom(h).trim());
  const rows = nonEmpty.slice(1);
  return { headers, rows };
}

export type HeaderMapResult = {
  map: Partial<Record<CanonicalKey, number>>;
  missing: CanonicalKey[];
};

// Risolve ogni chiave canonica a un indice di colonna. `override` (mappatura
// configurabile) ha precedenza sulle euristiche per alias.
export function mapHeaders(headers: string[], override?: ColumnMapping): HeaderMapResult {
  const normalized = headers.map(normHeader);
  const map: Partial<Record<CanonicalKey, number>> = {};
  for (const key of ALL_KEYS) {
    const ov = override?.[key];
    if (ov && ov.trim()) {
      const idx = normalized.indexOf(normHeader(ov));
      if (idx >= 0) map[key] = idx;
      continue; // override esplicito: se non trova, la chiave resta non mappata
    }
    const aliases = HEADER_ALIASES[key];
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx >= 0) map[key] = idx;
  }
  const missing = REQUIRED_KEYS.filter((k) => map[k] === undefined);
  return { map, missing };
}

function cell(row: string[], idx: number | undefined): string | null {
  if (idx === undefined) return null;
  const v = (row[idx] ?? '').trim();
  return v.length ? v : null;
}

export function normalizeRows(
  rows: string[][],
  map: Partial<Record<CanonicalKey, number>>,
): NormalizedRow[] {
  const out: NormalizedRow[] = [];
  rows.forEach((row, i) => {
    const nome = cell(row, map.nome) ?? '';
    const email = cell(row, map.email);
    const join = cell(row, map.join);
    const leave = cell(row, map.leave);
    const durata = cell(row, map.durata);
    if (!nome && !email && !join && !leave && !durata) return; // riga vuota
    out.push({ riga: i + 1, nome, email, join, leave, durata });
  });
  return out;
}

// Pipeline dell'adattatore: testo CSV → righe normalizzate, con errori espliciti
// PRIMA di toccare il grezzo. Restituisce anche headers/map per la UI (preview).
export function csvToNormalizedRows(
  text: string,
  override?: ColumnMapping,
): { rows: NormalizedRow[]; headers: string[]; map: Partial<Record<CanonicalKey, number>> } {
  const { headers, rows } = parseDelimited(text);
  const { map, missing } = mapHeaders(headers, override);
  if (missing.length) {
    throw new CsvAdapterError(
      `Colonne chiave mancanti: ${missing.join(', ')}. ` +
        `Intestazioni trovate: ${headers.join(' | ') || '(nessuna)'}. ` +
        `Usa la mappatura colonne per indicare quale intestazione corrisponde a ciascun campo.`,
    );
  }
  const normalized = normalizeRows(rows, map);
  if (normalized.length === 0) {
    throw new CsvAdapterError('Nessuna riga di dati valida nel CSV (solo intestazione?).');
  }
  return { rows: normalized, headers, map };
}
