/**
 * Visione integrale dei video (decisione del 2026-10-20).
 *
 * Il player registra i tratti effettivamente riprodotti come segmenti
 * [inizio, fine] in secondi e li invia nel payload degli eventi
 * video.pause / video.seek / video.ended (`segmenti_visti`). La copertura è
 * l'unione di tutti i segmenti registrati per (persona, LO): si RICALCOLA dagli
 * Eventi (D8), mai da una cache. Con `corso.visione_integrale = true` un LO
 * video è completato solo se ha ricevuto `video.ended` E la copertura è almeno
 * SOGLIA_VISIONE_INTEGRALE della durata.
 *
 * Funzioni pure, condivise da player (client), API (validazione) e compliance.
 */
export type Segmento = [number, number];

/** Quota della durata che deve risultare riprodotta (tolleranza per buffering e arrotondamenti). */
export const SOGLIA_VISIONE_INTEGRALE = 0.95;

/** Numero massimo di segmenti conservati in un payload (oltre, si fondono i vuoti più piccoli). */
export const MAX_SEGMENTI = 200;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Unione di segmenti: ordina, fonde sovrapposti/adiacenti (gap ≤ 0.5 s), arrotonda a 0.1 s. */
export function unisciSegmenti(input: ReadonlyArray<Segmento>, maxN = MAX_SEGMENTI): Segmento[] {
  const puliti = input
    .filter((s) => Array.isArray(s) && s.length === 2 && Number.isFinite(s[0]) && Number.isFinite(s[1]))
    .map(([a, b]): Segmento => (a <= b ? [a, b] : [b, a]))
    .sort((x, y) => x[0] - y[0]);
  const out: Segmento[] = [];
  for (const [a, b] of puliti) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 0.5) {
      if (b > last[1]) last[1] = b;
    } else {
      out.push([a, b]);
    }
  }
  // Troppi segmenti: fondi ripetutamente i due separati dal vuoto più piccolo
  // (il vuoto viene contato come visto: errore per eccesso minimo, limitato).
  while (out.length > maxN) {
    let bi = 0;
    let bgap = Infinity;
    for (let i = 0; i + 1 < out.length; i++) {
      const gap = out[i + 1][0] - out[i][1];
      if (gap < bgap) { bgap = gap; bi = i; }
    }
    out[bi][1] = Math.max(out[bi][1], out[bi + 1][1]);
    out.splice(bi + 1, 1);
  }
  return out.map(([a, b]) => [round1(a), round1(b)]);
}

/** Secondi coperti dall'unione dei segmenti. */
export function coperturaSecondi(input: ReadonlyArray<Segmento>): number {
  return round1(unisciSegmenti(input).reduce((acc, [a, b]) => acc + (b - a), 0));
}

/**
 * Validazione lato server del payload inviato dal client: accetta solo coppie
 * numeriche, le ritaglia in [0, durataMax] e le normalizza. Input non valido → [].
 */
export function normalizzaSegmenti(raw: unknown, durataMax: number): Segmento[] {
  if (!Array.isArray(raw) || !(durataMax > 0)) return [];
  const limite = durataMax + 1; // tolleranza di arrotondamento sulla fine
  const ok: Segmento[] = [];
  for (const s of raw.slice(0, 5000)) {
    if (!Array.isArray(s) || s.length !== 2) continue;
    const a = Number(s[0]);
    const b = Number(s[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const lo = Math.max(0, Math.min(a, b));
    const hi = Math.min(limite, Math.max(a, b));
    if (hi > lo) ok.push([lo, hi]);
  }
  return unisciSegmenti(ok);
}

/** Percentuale (0–100, 1 decimale) coperta rispetto alla durata. */
export function coperturaPercentuale(segmenti: ReadonlyArray<Segmento>, durata: number): number {
  if (!(durata > 0)) return 0;
  return Math.min(100, round1((coperturaSecondi(segmenti) / durata) * 100));
}

/** Regola di completamento in modalità integrale. */
export function visioneIntegraleCompleta(segmenti: ReadonlyArray<Segmento>, durata: number, haEnded: boolean): boolean {
  if (!haEnded || !(durata > 0)) return false;
  return coperturaSecondi(segmenti) >= SOGLIA_VISIONE_INTEGRALE * durata;
}

/**
 * Ricostruzione SERVER-SIDE dei tratti riprodotti dal tempo reale.
 *
 * Il client dichiara `segmenti_visti`, ma non è fonte di verità: un player a
 * 2x (o una chiamata all'API costruita a mano) dichiarerebbe tratti mai visti in
 * tempo reale. Qui si usano solo i timestamp server (`occurred_at`, scritti da
 * `audit_append`) e le posizioni dichiarate:
 *   play(pos) a t0 → stato "in riproduzione" da pos;
 *   pause(pos)/seek/ended/progress a t1 → tratto [pos0, min(pos_dichiarata, pos0 + (t1−t0)·TOLLERANZA)].
 * A velocità 1x le due cose coincidono; a 2x il tratto vale la metà del dichiarato;
 * una chiamata forgiata senza attesa reale vale ~0. Un tratto aperto da un play e
 * chiuso da un ALTRO play (scheda chiusa senza pausa) si PERDE: non si sa quando la
 * riproduzione si è fermata. Per limitare la perdita il player manda un
 * `video.progress` (checkpoint) ogni 60 s di riproduzione e un `video.pause` alla
 * chiusura della pagina: errore per difetto, mai per eccesso.
 */
export type EventoVideo = {
  event_type: string;
  occurred_at: string; // timestamp server
  payload: Record<string, unknown> | null;
};

/** Margine sul tempo reale: piccole derive del player e latenza di rete. */
export const TOLLERANZA_TEMPO_REALE = 1.02;
const LATENZA_SECONDI = 1.5;

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function ricostruisciTrattiDaEventi(eventi: ReadonlyArray<EventoVideo>, durataNota = 0): Segmento[] {
  const out: Segmento[] = [];
  let inizioPos: number | null = null;
  let inizioT = 0;
  let durata = durataNota;
  const chiudi = (t1: number, posDichiarata: number | null) => {
    if (inizioPos == null) return;
    const elapsed = Math.max(0, (t1 - inizioT) / 1000);
    let fine = inizioPos + elapsed * TOLLERANZA_TEMPO_REALE + LATENZA_SECONDI;
    if (posDichiarata != null) fine = Math.min(fine, posDichiarata);
    if (durata > 0) fine = Math.min(fine, durata);
    if (fine > inizioPos) out.push([inizioPos, fine]);
    inizioPos = null;
  };
  for (const e of eventi) {
    const t = Date.parse(e.occurred_at);
    if (!Number.isFinite(t)) continue;
    const p = e.payload ?? {};
    const d = num(p.durata_secondi);
    if (d != null && d > 0 && d > durata) durata = d;
    switch (e.event_type) {
      case 'video.play': {
        // Un play senza chiusura precedente (evento perso): il tratto aperto si
        // scarta — non si sa quando la riproduzione si è fermata davvero.
        inizioPos = num(p.posizione_secondi) ?? 0;
        inizioT = t;
        break;
      }
      case 'video.pause':
        chiudi(t, num(p.posizione_secondi));
        break;
      case 'video.progress': {
        // Checkpoint periodico: chiude il tratto alla posizione dichiarata (limitata
        // al tempo reale) e lo riapre dalla stessa posizione.
        const pos = num(p.posizione_secondi);
        if (inizioPos != null) {
          chiudi(t, pos);
          const riparti = pos != null ? Math.min(pos, out[out.length - 1]?.[1] ?? pos) : null;
          if (riparti != null) { inizioPos = riparti; inizioT = t; }
        }
        break;
      }
      case 'video.seek': {
        // Il tratto prima del salto finisce al tempo reale; dopo il salto il
        // player continua a riprodurre dalla nuova posizione SOLO se stava già
        // riproducendo (un seek in pausa non apre nessun tratto).
        const eraInRiproduzione = inizioPos != null;
        chiudi(t, num(p.from_secondi));
        const to = num(p.to_secondi);
        if (eraInRiproduzione && to != null) { inizioPos = to; inizioT = t; }
        break;
      }
      case 'video.ended':
        chiudi(t, durata > 0 ? durata : null);
        break;
      default:
        break;
    }
  }
  return unisciSegmenti(out);
}
