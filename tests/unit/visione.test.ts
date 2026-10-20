import { describe, expect, it } from 'vitest';
import {
  coperturaPercentuale, coperturaSecondi, normalizzaSegmenti, ricostruisciTrattiDaEventi, unisciSegmenti, visioneIntegraleCompleta,
} from '../../src/lib/visione';

describe('unisciSegmenti', () => {
  it('fonde sovrapposti e adiacenti, ordina, arrotonda', () => {
    expect(unisciSegmenti([[10, 20], [0, 5.04], [19, 30], [5.3, 7]])).toEqual([[0, 7], [10, 30]]);
  });
  it('accetta segmenti invertiti e scarta quelli non numerici', () => {
    expect(unisciSegmenti([[20, 10], [NaN, 3] as never, [40, 41]])).toEqual([[10, 20], [40, 41]]);
  });
  it('limita il numero di segmenti fondendo i vuoti più piccoli', () => {
    const many: [number, number][] = Array.from({ length: 10 }, (_, i) => [i * 10, i * 10 + 2]);
    expect(unisciSegmenti(many, 3)).toHaveLength(3);
  });
});

describe('copertura e regola integrale', () => {
  it('calcola secondi e percentuale sull\'unione', () => {
    const seg: [number, number][] = [[0, 100], [50, 150], [300, 310]];
    expect(coperturaSecondi(seg)).toBe(160);
    expect(coperturaPercentuale(seg, 320)).toBe(50);
  });
  it('richiede ended E copertura ≥ 95%', () => {
    expect(visioneIntegraleCompleta([[0, 519]], 519, true)).toBe(true);
    expect(visioneIntegraleCompleta([[0, 494]], 519, true)).toBe(true); // 95.2%
    expect(visioneIntegraleCompleta([[0, 57], [494, 519]], 519, true)).toBe(false); // il test "trascina alla fine"
    expect(visioneIntegraleCompleta([[0, 519]], 519, false)).toBe(false);
  });
});

describe('normalizzaSegmenti (validazione API)', () => {
  it('ritaglia nei limiti della durata e scarta spazzatura', () => {
    expect(normalizzaSegmenti([[-5, 10], [500, 900], 'x', [1], [3, 'a']], 519)).toEqual([[0, 10], [500, 520]]);
    expect(normalizzaSegmenti('no', 519)).toEqual([]);
    expect(normalizzaSegmenti([[0, 10]], 0)).toEqual([]);
  });
});

describe('ricostruisciTrattiDaEventi (tempo reale, timestamp server)', () => {
  const T0 = Date.parse('2026-10-20T05:36:12.000Z');
  const at = (sec: number) => new Date(T0 + sec * 1000).toISOString();
  const ev = (type: string, sec: number, payload: Record<string, unknown>) => ({ event_type: type, occurred_at: at(sec), payload });

  it('a 1x pausa e play coincidono con il tempo reale', () => {
    const tratti = ricostruisciTrattiDaEventi([
      ev('video.play', 0, { posizione_secondi: 0 }),
      ev('video.pause', 39, { posizione_secondi: 37.9 }),
      ev('video.play', 68, { posizione_secondi: 38 }),
      ev('video.pause', 88, { posizione_secondi: 57.1 }),
    ], 519);
    expect(tratti).toEqual([[0, 57.1]]);
  });

  it('a 2x conta solo il tempo reale: il video NON risulta visto per intero', () => {
    const tratti = ricostruisciTrattiDaEventi([
      ev('video.play', 0, { posizione_secondi: 0 }),
      ev('video.ended', 260, { durata_secondi: 519 }),
    ], 519);
    expect(coperturaSecondi(tratti)).toBeLessThan(270);
    expect(visioneIntegraleCompleta(tratti, 519, true)).toBe(false);
  });

  it('a 1x fino in fondo il video risulta visto', () => {
    const tratti = ricostruisciTrattiDaEventi([
      ev('video.play', 0, { posizione_secondi: 0 }),
      ev('video.ended', 519, { durata_secondi: 519 }),
    ], 519);
    expect(tratti).toEqual([[0, 519]]);
    expect(visioneIntegraleCompleta(tratti, 519, true)).toBe(true);
  });

  it('il salto in avanti non regala copertura: conta solo quanto riprodotto davvero', () => {
    const tratti = ricostruisciTrattiDaEventi([
      ev('video.play', 0, { posizione_secondi: 0 }),
      ev('video.seek', 2, { from_secondi: null, to_secondi: 494.8 }),
      ev('video.ended', 26, { durata_secondi: 518.6 }),
    ], 519);
    expect(coperturaSecondi(tratti)).toBeLessThan(32);
    expect(visioneIntegraleCompleta(tratti, 519, true)).toBe(false);
  });

  it('una chiamata forgiata senza attesa reale vale quasi nulla', () => {
    const tratti = ricostruisciTrattiDaEventi([
      ev('video.play', 0, { posizione_secondi: 0 }),
      ev('video.pause', 1, { posizione_secondi: 519, segmenti_visti: [[0, 519]] }),
    ], 519);
    expect(coperturaSecondi(tratti)).toBeLessThan(4);
  });

  it('un seek in pausa non apre nessun tratto (niente credito per il tempo di attesa)', () => {
    const tratti = ricostruisciTrattiDaEventi([
      ev('video.play', 0, { posizione_secondi: 0 }),
      ev('video.pause', 10, { posizione_secondi: 10 }),
      ev('video.seek', 12, { from_secondi: null, to_secondi: 5 }),
      ev('video.play', 600, { posizione_secondi: 5 }),
      ev('video.pause', 605, { posizione_secondi: 10 }),
    ], 519);
    expect(tratti).toEqual([[0, 10]]);
  });

  it('un evento di chiusura mancante perde il tratto (errore per difetto)', () => {
    const tratti = ricostruisciTrattiDaEventi([
      ev('video.play', 0, { posizione_secondi: 0 }),
      ev('video.play', 300, { posizione_secondi: 0 }),
      ev('video.pause', 310, { posizione_secondi: 10 }),
    ], 519);
    // il primo play viene chiuso dal secondo al tempo reale: 300 s a 1x → [0, ~300]
    expect(coperturaSecondi(tratti)).toBeGreaterThanOrEqual(300);
    expect(coperturaSecondi(tratti)).toBeLessThan(310);
  });
});
