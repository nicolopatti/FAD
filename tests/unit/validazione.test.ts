import { describe, it, expect } from 'vitest';
import { conflittiIdentita, isEmail, parseSoglia } from '../../src/lib/validazione';

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

describe('conflittiIdentita (A4)', () => {
  const mario = { nome: 'Mario', cognome: 'Rossi', codice_fiscale: null };
  it('stessa persona: nessun conflitto, anche con accenti, maiuscole o nome e cognome invertiti', () => {
    expect(conflittiIdentita({ nome: 'mario', cognome: 'ROSSI', codice_fiscale: null }, mario)).toEqual([]);
    expect(conflittiIdentita({ nome: 'Rossi', cognome: 'Mario', codice_fiscale: null }, mario)).toEqual([]);
    expect(conflittiIdentita({ nome: 'Nicolò', cognome: "D'Amico", codice_fiscale: null }, { nome: 'Nicolo', cognome: 'D Amico', codice_fiscale: null })).toEqual([]);
  });
  it('nome diverso → conflitto (Verdi Giuseppe con l’email di Mario Rossi)', () => {
    expect(conflittiIdentita({ nome: 'Giuseppe', cognome: 'Verdi', codice_fiscale: null }, mario)).toEqual(['nome']);
  });
  it('CF: diverso = conflitto; nuovo su chi non l’ha = da confermare; uguale = ok', () => {
    const conCf = { ...mario, codice_fiscale: 'RSSMRA80A01H501U' };
    expect(conflittiIdentita({ nome: 'Mario', cognome: 'Rossi', codice_fiscale: 'VRDGPP80A01H501X' }, conCf)).toEqual(['codice_fiscale']);
    expect(conflittiIdentita({ nome: 'Mario', cognome: 'Rossi', codice_fiscale: 'rssmra80a01h501u' }, conCf)).toEqual([]);
    expect(conflittiIdentita({ nome: 'Mario', cognome: 'Rossi', codice_fiscale: 'RSSMRA80A01H501U' }, mario)).toEqual(['codice_fiscale_nuovo']);
  });
});
