import { describe, it, expect } from 'vitest';
import { finestraEdizione, finestraIscrizione, giornoRoma, messaggioFinestra, etichettaFinestra, type EdizioneFinestra } from '../../src/lib/finestra';

const base: EdizioneFinestra = { data_inizio: null, data_fine: null, fad_apertura: null, fad_chiusura: null, concluso_at: null, annullato_at: null };

describe('finestraEdizione (R2)', () => {
  it('senza date: sempre aperta', () => {
    expect(finestraEdizione(base, '2030-01-01').aperta).toBe(true);
  });
  it('usa la finestra FAD se c’è, altrimenti le date dell’edizione', () => {
    const e = { ...base, data_inizio: '2026-05-21', data_fine: '2026-07-20' };
    expect(finestraEdizione(e, '2026-10-21').stato).toBe('chiusa');
    expect(finestraEdizione({ ...e, fad_chiusura: '2026-12-31' }, '2026-10-21').stato).toBe('aperta');
    expect(finestraEdizione({ ...e, fad_apertura: '2026-11-01', fad_chiusura: '2026-12-31' }, '2026-10-21').stato).toBe('non_aperta');
  });
  it('giorni interi: aperta il primo e l’ultimo giorno', () => {
    const e = { ...base, fad_apertura: '2026-11-01', fad_chiusura: '2026-11-30' };
    expect(finestraEdizione(e, '2026-10-31').aperta).toBe(false);
    expect(finestraEdizione(e, '2026-11-01').aperta).toBe(true);
    expect(finestraEdizione(e, '2026-11-30').aperta).toBe(true);
    expect(finestraEdizione(e, '2026-12-01').aperta).toBe(false);
  });
  it('un solo estremo: nessun limite dall’altro lato', () => {
    expect(finestraEdizione({ ...base, data_fine: '2026-12-31' }, '2000-01-01').aperta).toBe(true);
    expect(finestraEdizione({ ...base, fad_apertura: '2026-01-01' }, '2099-01-01').aperta).toBe(true);
  });
  it('annullata o conclusa: chiusa anche con le date giuste', () => {
    const e = { ...base, data_inizio: '2026-01-01', data_fine: '2026-12-31' };
    expect(finestraEdizione({ ...e, annullato_at: '2026-06-01T10:00:00Z' }, '2026-07-01').stato).toBe('annullata');
    expect(finestraEdizione({ ...e, concluso_at: '2026-06-01T10:00:00Z' }, '2026-07-01').stato).toBe('conclusa');
  });
  it('il giorno è quello di Roma (23:30 UTC del 31/12 = 1° gennaio a Roma)', () => {
    expect(giornoRoma(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
    expect(giornoRoma(new Date('2026-07-20T21:59:00Z'))).toBe('2026-07-20');
  });
  it('messaggi ed etichette per il discente', () => {
    const e = { ...base, fad_apertura: '2026-11-01', fad_chiusura: '2026-11-30' };
    expect(messaggioFinestra(finestraEdizione(e, '2026-10-01'))).toBe('Le lezioni si aprono il 01/11/2026.');
    expect(messaggioFinestra(finestraEdizione(e, '2026-12-01'))).toContain('fino al 30/11/2026');
    expect(etichettaFinestra(finestraEdizione(e, '2026-10-01'))).toBe('Non ancora aperto');
    expect(etichettaFinestra(finestraEdizione(e, '2026-12-01'))).toBe('Chiuso');
    expect(etichettaFinestra(finestraEdizione(e, '2026-11-10'))).toBeNull();
  });
});

describe('finestraIscrizione (Fase 6: accesso per iscritto)', () => {
  const ed = { ...base, data_inizio: '2026-01-01', data_fine: '2027-07-31' };
  it('senza campi di accesso = finestra dell’edizione', () => {
    expect(finestraIscrizione(ed, {}, '2026-10-21')).toEqual(finestraEdizione(ed, '2026-10-21'));
  });
  it('accesso a scadenza: aperto fino all’ultimo giorno, poi scaduto', () => {
    const a = { accesso_dal: '2026-10-21', accesso_fino_al: '2026-11-20' };
    expect(finestraIscrizione(ed, a, '2026-11-20').aperta).toBe(true);
    const f = finestraIscrizione(ed, a, '2026-11-21');
    expect(f.stato).toBe('scaduta');
    expect(messaggioFinestra(f)).toBe('Il tuo accesso era valido fino al 20/11/2026: ora è scaduto.');
    expect(etichettaFinestra(f)).toBe('Accesso scaduto');
  });
  it('vince il limite più stretto fra edizione e accesso', () => {
    const f = finestraIscrizione(ed, { accesso_fino_al: '2028-01-01' }, '2027-08-01');
    expect(f.stato).toBe('chiusa');
    expect(finestraIscrizione(ed, { accesso_fino_al: '2026-12-31' }, '2026-10-21').chiude_il).toBe('2026-12-31');
    expect(finestraIscrizione(ed, { accesso_dal: '2026-11-01' }, '2026-10-21').stato).toBe('non_aperta');
  });
  it('revoca (rimborso): chiuso anche con date valide', () => {
    expect(finestraIscrizione(ed, { accesso_revocato_at: '2026-10-21T10:00:00Z' }, '2026-10-21').stato).toBe('revocata');
  });
});

describe('edizioneTerminata (B7)', () => {
  it('attiva con data di fine passata → da concludere; conclusa, annullata o senza fine no', async () => {
    const { edizioneTerminata } = await import('../../src/lib/db-types');
    const e = { concluso_at: null, annullato_at: null, data_fine: '2026-07-20' };
    expect(edizioneTerminata(e, '2026-10-21')).toBe(true);
    expect(edizioneTerminata(e, '2026-07-20')).toBe(false);
    expect(edizioneTerminata({ ...e, concluso_at: '2026-08-01T00:00:00Z' }, '2026-10-21')).toBe(false);
    expect(edizioneTerminata({ ...e, annullato_at: '2026-08-01T00:00:00Z' }, '2026-10-21')).toBe(false);
    expect(edizioneTerminata({ ...e, data_fine: null }, '2026-10-21')).toBe(false);
  });
});
