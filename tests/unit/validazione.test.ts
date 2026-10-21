import { describe, it, expect } from 'vitest';
import { isEmail, parseSoglia } from '../../src/lib/validazione';

describe('parseSoglia', () => {
  it('vuoto = nessun requisito', () => {
    expect(parseSoglia('')).toBeNull();
    expect(parseSoglia(null)).toBeNull();
    expect(parseSoglia(undefined)).toBeNull();
  });
  it('accetta interi, decimali e la virgola', () => {
    expect(parseSoglia('80')).toBe(80);
    expect(parseSoglia(' 75,5 ')).toBe(75.5);
    expect(parseSoglia(100)).toBe(100);
  });
  it('rifiuta zero, negativi, oltre 100 e testo', () => {
    for (const v of ['0', '-5', '100.5', 'ottanta', '80%']) expect(parseSoglia(v)).toBeUndefined();
  });
});

describe('isEmail', () => {
  it('riconosce gli indirizzi validi e scarta quelli rotti', () => {
    expect(isEmail('mario.rossi@azienda.it')).toBe(true);
    for (const v of ['non-una-email', 'a@b', 'a b@c.it', '@azienda.it']) expect(isEmail(v)).toBe(false);
  });
});
