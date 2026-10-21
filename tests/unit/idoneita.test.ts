import { describe, it, expect } from 'vitest';
import { deriveIdoneita } from '../../src/lib/report-fondo';
import { calcolaFrequenza } from '../../src/lib/compliance';

describe('deriveIdoneita: presenza minima senza sessioni (A2)', () => {
  it('soglia impostata e zero sessioni: decide il solo percorso online', () => {
    const r = deriveIdoneita(3, true, 80, false, 0);
    expect(r).toEqual({ criterio: 'completamento', idoneo: true, frequenza_in_attesa: true });
    expect(deriveIdoneita(3, false, 80, false, 0).idoneo).toBe(false);
  });
  it('soglia impostata, zero sessioni e zero lezioni: nessun criterio, mai idoneo', () => {
    expect(deriveIdoneita(0, true, 80, false, 0)).toEqual({ criterio: 'nessuno', idoneo: false, frequenza_in_attesa: true });
  });
  it('caso reale invariato: sessioni presenti e frequenza bassa → non idoneo', () => {
    expect(deriveIdoneita(3, true, 80, false, 2)).toEqual({ criterio: 'misto', idoneo: false, frequenza_in_attesa: false });
    expect(deriveIdoneita(0, false, 80, false, 1)).toEqual({ criterio: 'frequenza', idoneo: false, frequenza_in_attesa: false });
    expect(deriveIdoneita(0, false, 80, true, 1).idoneo).toBe(true);
  });
  it('senza il numero di sessioni: comportamento di sempre', () => {
    expect(deriveIdoneita(3, true, 80, false)).toEqual({ criterio: 'misto', idoneo: false, frequenza_in_attesa: false });
  });
});

describe('calcolaFrequenza: in_attesa_sessioni', () => {
  const iscr = { id: 'i', edizione_id: 'e' };
  it('soglia e nessuna sessione (o solo annullate) → in attesa, non idoneo', () => {
    expect(calcolaFrequenza(iscr, 80, [], []).in_attesa_sessioni).toBe(true);
    const f = calcolaFrequenza(iscr, 80, [{ id: 's', edizione_id: 'e', durata_minuti: 60, annullato_at: '2026-01-01' }], []);
    expect(f.in_attesa_sessioni).toBe(true);
    expect(f.idoneo_frequenza).toBe(false);
  });
  it('con una sessione valida o senza soglia → non in attesa', () => {
    expect(calcolaFrequenza(iscr, 80, [{ id: 's', edizione_id: 'e', durata_minuti: 60, annullato_at: null }], []).in_attesa_sessioni).toBe(false);
    expect(calcolaFrequenza(iscr, null, [], []).in_attesa_sessioni).toBe(false);
  });
});
