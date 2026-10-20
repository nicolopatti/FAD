// Test finale (Fase 5): correzione lato server, config, import CSV.
// Puro: nessun accesso a DB, testabile in isolamento.

import type { QuizConfig, QuizDomandaRow, QuizRisposta, QuizTipoDomanda } from './db-types';
import { parseDelimited } from './csv';

export const SOGLIA_DEFAULT = 70;

export type { DomandaPublica as DomandaPubblica } from './quiz-types';
import type { DomandaPublica } from './quiz-types';

// Il discente vede le domande senza il flag `corretta`.
export function spogliaDomande(domande: QuizDomandaRow[]): DomandaPublica[] {
  return domande.map((d) => ({
    id: d.id,
    ordine: d.ordine,
    testo: d.testo,
    tipo: d.tipo,
    risposte: d.risposte.map((r) => ({ testo: r.testo })),
  }));
}

export function mescola<T>(items: T[], seed?: number): T[] {
  const out = [...items];
  // LCG deterministico se c'è un seme (riproducibilità nei test), altrimenti Math.random.
  let s = seed ?? Math.floor(Math.random() * 2 ** 31);
  const rnd = seed == null ? Math.random : () => { s = (s * 1103515245 + 12345) % 2 ** 31; return s / 2 ** 31; };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type RisposteDate = Record<string, number[]>; // domanda_id → indici scelti

export type EsitoCorrezione = {
  punteggio: number;
  totale: number;
  percentuale: number; // 0–100, arrotondata a 1 decimale
  superato: boolean;
  dettaglio: { domanda_id: string; corretta: boolean; scelte: number[]; giuste: number[] }[];
};

function indiciCorretti(risposte: QuizRisposta[]): number[] {
  return risposte.map((r, i) => (r.corretta ? i : -1)).filter((i) => i >= 0);
}

function uguali(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

// Una domanda vale 1 punto: scelta singola → l'indice giusto; scelta multipla →
// tutto-o-niente (esattamente l'insieme delle corrette). Indici fuori range o
// duplicati non contano. Nessuna penalità.
export function correggi(domande: QuizDomandaRow[], date: RisposteDate, soglia: number): EsitoCorrezione {
  const dettaglio = domande.map((d) => {
    const giuste = indiciCorretti(d.risposte);
    const raw = Array.isArray(date[d.id]) ? date[d.id] : [];
    const scelte = Array.from(new Set(raw.filter((i) => Number.isInteger(i) && i >= 0 && i < d.risposte.length)));
    const corretta = d.tipo === 'scelta_singola' ? scelte.length === 1 && giuste.includes(scelte[0]) : uguali(scelte, giuste);
    return { domanda_id: d.id, corretta, scelte, giuste };
  });
  const totale = domande.length;
  const punteggio = dettaglio.filter((x) => x.corretta).length;
  const percentuale = totale === 0 ? 0 : Math.round((punteggio / totale) * 1000) / 10;
  const superato = totale > 0 && percentuale >= soglia;
  return { punteggio, totale, percentuale, superato, dettaglio };
}

export function validaConfigQuiz(c: Record<string, unknown>): QuizConfig | string {
  const soglia = Number(c.soglia_percentuale);
  if (!Number.isFinite(soglia) || soglia < 0 || soglia > 100) return 'config.soglia_percentuale deve essere tra 0 e 100';
  let tentativi: number | null = null;
  if (c.tentativi_max != null && c.tentativi_max !== '') {
    const t = Number(c.tentativi_max);
    if (!Number.isInteger(t) || t < 1 || t > 99) return 'config.tentativi_max deve essere un intero tra 1 e 99 (o vuoto = illimitati)';
    tentativi = t;
  }
  return {
    soglia_percentuale: Math.round(soglia),
    tentativi_max: tentativi,
    ordine_casuale: c.ordine_casuale !== false,
    mostra_correzione: c.mostra_correzione !== false,
  };
}

export function configQuizDa(config: Record<string, unknown>): QuizConfig {
  const v = validaConfigQuiz(config);
  return typeof v === 'string' ? { soglia_percentuale: SOGLIA_DEFAULT, tentativi_max: null, ordine_casuale: true, mostra_correzione: true } : v;
}

// Validazione lato applicazione di un set di domande (stesse regole del CHECK
// in DB, con messaggi per l'editor).
export type DomandaInput = { testo: string; tipo: QuizTipoDomanda; risposte: QuizRisposta[] };

export function validaDomande(domande: DomandaInput[]): string[] {
  const errori: string[] = [];
  if (domande.length === 0) errori.push('Serve almeno una domanda.');
  domande.forEach((d, i) => {
    const n = i + 1;
    if (!d.testo.trim()) errori.push(`Domanda ${n}: testo mancante.`);
    const risposte = d.risposte.filter((r) => r.testo.trim());
    if (risposte.length < 2) errori.push(`Domanda ${n}: servono almeno due risposte.`);
    if (risposte.length > 8) errori.push(`Domanda ${n}: al massimo otto risposte.`);
    const corrette = risposte.filter((r) => r.corretta).length;
    if (d.tipo === 'scelta_singola' && corrette !== 1) errori.push(`Domanda ${n}: a scelta singola, indica esattamente una risposta corretta.`);
    if (d.tipo === 'scelta_multipla' && corrette < 1) errori.push(`Domanda ${n}: indica almeno una risposta corretta.`);
  });
  return errori;
}

// CSV: Domanda; Risposta A; Risposta B; Risposta C; Risposta D; Corretta (A oppure "A,C"); Tipo (facoltativo)
const LETTERE = 'ABCDEFGH';

function col(headers: string[], ...alias: string[]): number {
  const norm = (s: string) => s.toLowerCase().trim().replace(/[\s_]+/g, ' ');
  const H = headers.map(norm);
  for (const a of alias) { const i = H.indexOf(norm(a)); if (i >= 0) return i; }
  for (let i = 0; i < H.length; i++) if (alias.some((a) => H[i].startsWith(norm(a)))) return i;
  return -1;
}

export function parseQuizCsv(text: string): { domande: DomandaInput[]; errori: string[] } {
  const { headers, rows } = parseDelimited(text);
  const cDomanda = col(headers, 'domanda', 'question', 'testo');
  const cCorretta = col(headers, 'corretta', 'corrette', 'correct', 'risposta corretta');
  const cTipo = col(headers, 'tipo', 'type');
  const cRisposte = LETTERE.split('').map((l) => col(headers, `risposta ${l}`, `risposta${l}`, `opzione ${l}`, l)).filter((i) => i >= 0);
  const errori: string[] = [];
  if (cDomanda < 0) errori.push('Manca la colonna "Domanda".');
  if (cCorretta < 0) errori.push('Manca la colonna "Corretta" (es. A oppure A,C).');
  if (cRisposte.length < 2) errori.push('Servono almeno le colonne "Risposta A" e "Risposta B".');
  if (errori.length) return { domande: [], errori };
  const domande: DomandaInput[] = [];
  rows.forEach((r, idx) => {
    const testo = (r[cDomanda] ?? '').trim();
    if (!testo) return; // riga vuota
    const testi = cRisposte.map((ci) => (r[ci] ?? '').trim());
    const lettereCorrette = (r[cCorretta] ?? '').toUpperCase().split(/[,; ]+/).filter(Boolean);
    const idxCorrette = lettereCorrette.map((l) => LETTERE.indexOf(l)).filter((i) => i >= 0);
    const risposte: QuizRisposta[] = testi.map((t, i) => ({ testo: t, corretta: idxCorrette.includes(i) })).filter((x) => x.testo);
    const tipoRaw = cTipo >= 0 ? (r[cTipo] ?? '').toLowerCase() : '';
    const tipo: QuizTipoDomanda = tipoRaw.startsWith('mult') || idxCorrette.length > 1 ? 'scelta_multipla' : 'scelta_singola';
    if (risposte.filter((x) => x.corretta).length === 0) errori.push(`Riga ${idx + 1}: nessuna risposta corretta riconosciuta (${r[cCorretta] ?? ''}).`);
    domande.push({ testo, tipo, risposte });
  });
  errori.push(...validaDomande(domande));
  return { domande, errori };
}
