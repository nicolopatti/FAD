import { describe, it, expect } from 'vitest';
import { conflittiIdentita, erroriDateEdizione, isEmail, parseSoglia } from '../../src/lib/validazione';

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

describe('erroriDateEdizione (B1)', () => {
  it('il caso dello stress test: FAD che apre dopo la fine del corso → errore', () => {
    expect(erroriDateEdizione({ data_inizio: '2026-12-31', data_fine: '2027-01-31', fad_apertura: '2027-03-01' })).toHaveProperty('fad_apertura');
  });
  it('date coerenti o vuote: nessun errore; FAD aperta prima dell’inizio ammessa', () => {
    expect(erroriDateEdizione({})).toEqual({});
    expect(erroriDateEdizione({ data_inizio: '2026-11-01', data_fine: '2026-12-31', fad_apertura: '2026-10-25', fad_chiusura: '2026-12-31' })).toEqual({});
  });
  it('fine prima dell’inizio, chiusura prima dell’apertura, chiusura dopo la fine o prima dell’inizio', () => {
    expect(erroriDateEdizione({ data_inizio: '2026-11-02', data_fine: '2026-11-01' })).toHaveProperty('data_fine');
    expect(erroriDateEdizione({ fad_apertura: '2026-11-02', fad_chiusura: '2026-11-01' })).toHaveProperty('fad_chiusura');
    expect(erroriDateEdizione({ data_fine: '2026-11-30', fad_chiusura: '2026-12-15' }).fad_chiusura).toContain('dopo la fine');
    expect(erroriDateEdizione({ data_inizio: '2026-11-10', fad_chiusura: '2026-11-05' }).fad_chiusura).toContain('prima che il corso inizi');
  });
});

describe('richiedePasswordAttuale (B8)', () => {
  it('sessione da login con password → serve l’attuale', async () => {
    const { richiedePasswordAttuale } = await import('../../src/lib/validazione');
    expect(richiedePasswordAttuale([{ method: 'password', timestamp: 1 }])).toBe(true);
  });
  it('sessione da link (invito, reimpostazione, otp) → no', async () => {
    const { richiedePasswordAttuale } = await import('../../src/lib/validazione');
    expect(richiedePasswordAttuale([{ method: 'recovery', timestamp: 1 }])).toBe(false);
    expect(richiedePasswordAttuale([{ method: 'otp', timestamp: 1 }])).toBe(false);
    expect(richiedePasswordAttuale(undefined)).toBe(false);
  });
});
