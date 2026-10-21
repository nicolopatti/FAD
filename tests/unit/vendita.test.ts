import { describe, it, expect } from 'vitest';
import {
  parsePrezzo, fmtPrezzo, prezzoPerCampo, scorporoIva, slugDa, isSlug,
  validaOfferta, validaFatturazione, isPartitaIva, intestatario, motivoNonVendibile,
} from '../../src/lib/vendita';

describe('prezzi', () => {
  it('parsePrezzo accetta i formati italiani e inglesi', () => {
    expect(parsePrezzo('49')).toBe(4900);
    expect(parsePrezzo('49,9')).toBe(4990);
    expect(parsePrezzo('49,90 €')).toBe(4990);
    expect(parsePrezzo('1.250,00')).toBe(125000);
    expect(parsePrezzo('49.90')).toBe(4990);
    expect(parsePrezzo('')).toBeNull();
    expect(parsePrezzo('49,999')).toBeNull();
    expect(parsePrezzo('-5')).toBeNull();
    expect(parsePrezzo('abc')).toBeNull();
  });
  it('fmtPrezzo e prezzoPerCampo', () => {
    expect(fmtPrezzo(4900).replace(/\s/g, ' ')).toBe('49,00 €');
    expect(prezzoPerCampo(4990)).toBe('49,90');
    expect(prezzoPerCampo(null)).toBe('');
  });
  it('scorporo IVA: la somma torna sempre al prezzo', () => {
    expect(scorporoIva(12200, 22)).toEqual({ imponibile: 10000, iva: 2200 });
    const s = scorporoIva(4990, 22);
    expect(s.imponibile + s.iva).toBe(4990);
    expect(scorporoIva(4990, 0)).toEqual({ imponibile: 4990, iva: 0 });
  });
});

describe('slug', () => {
  it('dal titolo, senza accenti né simboli', () => {
    expect(slugDa('Sicurezza sul lavoro – modulo base')).toBe('sicurezza-sul-lavoro-modulo-base');
    expect(slugDa('Qualità & Perché?')).toBe('qualita-perche');
    expect(isSlug('corso-base-2026')).toBe(true);
    expect(isSlug('Corso base')).toBe(false);
    expect(isSlug('-x')).toBe(false);
  });
});

describe('validaOfferta', () => {
  const ok = { slug: 'corso-base', prezzo: '49', tipo: 'online' as const, accesso_giorni: '365' };
  it('online: prezzo e giorni di accesso obbligatori', () => {
    const r = validaOfferta(ok);
    expect(r.errori).toEqual({});
    expect(r.valori).toMatchObject({ prezzo_centesimi: 4900, accesso_giorni: 365, aliquota_iva: 22, posti_max: null });
    expect(validaOfferta({ ...ok, accesso_giorni: '' }).errori.accesso_giorni).toBeTruthy();
  });
  it('a date: niente giorni di accesso, posti facoltativi', () => {
    const r = validaOfferta({ slug: 'webinar', prezzo: '30', tipo: 'date', posti_max: '20' });
    expect(r.valori).toMatchObject({ accesso_giorni: null, posti_max: 20 });
  });
  it('errori per campo', () => {
    const r = validaOfferta({ slug: 'Corso Base', prezzo: '0,10', tipo: 'online', accesso_giorni: '0', posti_max: '0', vendita_dal: '2026-12-01', vendita_al: '2026-11-01' });
    expect(Object.keys(r.errori).sort()).toEqual(['accesso_giorni', 'posti_max', 'prezzo', 'slug', 'vendita_al']);
    expect(r.valori).toBeUndefined();
  });
  it('IVA a zero vuole il motivo', () => {
    expect(validaOfferta({ ...ok, aliquota_iva: '0' }).errori.natura_iva).toBeTruthy();
    expect(validaOfferta({ ...ok, aliquota_iva: '0', natura_iva: 'Esente art. 10 c.1 n.20 DPR 633/72' }).errori).toEqual({});
  });
});

describe('validaFatturazione', () => {
  const indirizzo = { indirizzo: 'Via Roma 1', cap: '20100', citta: 'Milano', provincia: 'mi' };
  it('privato: nome, cognome, CF validi', () => {
    const r = validaFatturazione({ tipo: 'privato', nome: 'Anna', cognome: 'Rossi', codice_fiscale: 'rssnna80a41f205x', ...indirizzo });
    expect(r.errori).toEqual({});
    expect(r.valori).toMatchObject({ codice_fiscale: 'RSSNNA80A41F205X', provincia: 'MI', nazione: 'IT' });
    expect(intestatario(r.valori)).toBe('Anna Rossi');
  });
  it('privato: CF mancante o sbagliato', () => {
    expect(validaFatturazione({ tipo: 'privato', nome: 'A', cognome: 'B', ...indirizzo }).errori.codice_fiscale).toBeTruthy();
    expect(validaFatturazione({ tipo: 'privato', nome: 'A', cognome: 'B', codice_fiscale: '123', ...indirizzo }).errori.codice_fiscale).toMatch(/non sembra valido/);
  });
  it('azienda: P.IVA, SDI o PEC', () => {
    const base = { tipo: 'azienda' as const, ragione_sociale: 'ACME srl', partita_iva: 'IT 01234567890', ...indirizzo };
    expect(validaFatturazione(base).errori.codice_sdi).toMatch(/SDI|PEC/);
    const r = validaFatturazione({ ...base, codice_sdi: 'm5uxcr1' });
    expect(r.errori).toEqual({});
    expect(r.valori).toMatchObject({ partita_iva: '01234567890', codice_fiscale: '01234567890', codice_sdi: 'M5UXCR1' });
    expect(validaFatturazione({ ...base, partita_iva: '123', pec: 'acme@pec.it' }).errori.partita_iva).toBeTruthy();
    expect(isPartitaIva('01234567890')).toBe(true);
  });
  it('indirizzo italiano: CAP e provincia', () => {
    const r = validaFatturazione({ tipo: 'privato', nome: 'A', cognome: 'B', codice_fiscale: 'RSSNNA80A41F205X', indirizzo: 'x', cap: '201', citta: 'Milano', provincia: 'Milano' });
    expect(Object.keys(r.errori).sort()).toEqual(['cap', 'provincia']);
  });
});

describe('motivoNonVendibile', () => {
  it('frasi per il visitatore', () => {
    expect(motivoNonVendibile(null)).toBeNull();
    expect(motivoNonVendibile('posti esauriti')).toBe('Posti esauriti.');
    expect(motivoNonVendibile('qualcosa di nuovo')).toMatch(/non è possibile/);
  });
});
