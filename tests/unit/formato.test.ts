import { describe, it, expect } from 'vitest';
import { fmtDurata, fmtOre, plurale } from '../../src/lib/formato';

describe('formato (C)', () => {
  it('stessa durata ovunque: 519 s = 8 min 39 s; il totale si somma prima di formattare', () => {
    expect(fmtDurata(519)).toBe('8 min 39 s');
    expect(fmtDurata(3345)).toBe('55 min 45 s');
    expect(fmtDurata(3600 + 300)).toBe('1 h 5 min');
    expect(fmtDurata(45)).toBe('45 s');
    expect(fmtDurata(0)).toBeNull();
  });
  it('ore in formato italiano', () => {
    expect(fmtOre(1.8333)).toBe('1,83 h');
    expect(fmtOre(2)).toBe('2 h');
  });
  it('singolare e plurale', () => {
    expect(plurale(1, 'iscritto', 'iscritti')).toBe('1 iscritto');
    expect(plurale(0, 'lezione', 'lezioni')).toBe('0 lezioni');
  });
});
