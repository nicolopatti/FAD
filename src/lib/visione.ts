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
