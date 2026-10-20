import { describe, expect, it } from 'vitest';
import {
  coperturaPercentuale, coperturaSecondi, normalizzaSegmenti, unisciSegmenti, visioneIntegraleCompleta,
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
