import { describe, it, expect } from 'vitest';
import { correggi, parseQuizCsv, spogliaDomande, validaConfigQuiz, validaDomande, mescola } from '../../src/lib/quiz';
import type { QuizDomandaRow } from '../../src/lib/db-types';

const D: QuizDomandaRow[] = [
  { id: 'd1', learning_object_id: 'lo', ordine: 1, testo: 'Singola', tipo: 'scelta_singola', risposte: [{ testo: 'A', corretta: true }, { testo: 'B' }, { testo: 'C' }] },
  { id: 'd2', learning_object_id: 'lo', ordine: 2, testo: 'Multipla', tipo: 'scelta_multipla', risposte: [{ testo: 'A', corretta: true }, { testo: 'B', corretta: true }, { testo: 'C' }] },
  { id: 'd3', learning_object_id: 'lo', ordine: 3, testo: 'Singola 2', tipo: 'scelta_singola', risposte: [{ testo: 'Sì' }, { testo: 'No', corretta: true }] },
];

describe('correggi', () => {
  it('tutte giuste → 100%, superato', () => {
    const e = correggi(D, { d1: [0], d2: [0, 1], d3: [1] }, 70);
    expect(e.punteggio).toBe(3);
    expect(e.percentuale).toBe(100);
    expect(e.superato).toBe(true);
  });
  it('multipla parziale non vale (tutto o niente)', () => {
    const e = correggi(D, { d1: [0], d2: [0], d3: [1] }, 70);
    expect(e.punteggio).toBe(2);
    expect(e.percentuale).toBe(66.7);
    expect(e.superato).toBe(false);
  });
  it('soglia inclusiva', () => {
    expect(correggi(D, { d1: [0], d2: [0], d3: [1] }, 66).superato).toBe(true);
  });
  it('singola con due scelte non vale; indici fuori range ignorati; domanda saltata = 0', () => {
    const e = correggi(D, { d1: [0, 1], d2: [0, 1, 9], d3: [] }, 70);
    expect(e.dettaglio.map((x) => x.corretta)).toEqual([false, true, false]);
  });
  it('senza domande non si supera', () => {
    expect(correggi([], {}, 0).superato).toBe(false);
  });
});

describe('spogliaDomande / mescola', () => {
  it('toglie il flag corretta', () => {
    const p = spogliaDomande(D);
    expect(JSON.stringify(p)).not.toContain('corretta');
    expect(p[0].risposte.length).toBe(3);
  });
  it('mescola con seme è una permutazione', () => {
    const m = mescola([1, 2, 3, 4, 5], 42);
    expect([...m].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(mescola([1, 2, 3, 4, 5], 42)).toEqual(m);
  });
});

describe('validaConfigQuiz', () => {
  it('normalizza i default', () => {
    expect(validaConfigQuiz({ soglia_percentuale: 70 })).toEqual({ soglia_percentuale: 70, tentativi_max: null, ordine_casuale: true, mostra_correzione: true });
  });
  it('rifiuta soglia e tentativi non validi', () => {
    expect(typeof validaConfigQuiz({ soglia_percentuale: 120 })).toBe('string');
    expect(typeof validaConfigQuiz({ soglia_percentuale: 70, tentativi_max: 0 })).toBe('string');
    expect(validaConfigQuiz({ soglia_percentuale: 80, tentativi_max: '3', ordine_casuale: false })).toMatchObject({ tentativi_max: 3, ordine_casuale: false });
  });
});

describe('validaDomande / parseQuizCsv', () => {
  it('segnala singola senza corretta e meno di due risposte', () => {
    const e = validaDomande([{ testo: 'Q', tipo: 'scelta_singola', risposte: [{ testo: 'A' }] }]);
    expect(e.length).toBe(2);
  });
  it('legge un CSV con lettere corrette e tipo dedotto', () => {
    const csv = 'Domanda;Risposta A;Risposta B;Risposta C;Corretta\nQuanto fa 2+2?;3;4;5;B\nQuali sono pari?;2;3;4;A,C\n';
    const { domande, errori } = parseQuizCsv(csv);
    expect(errori).toEqual([]);
    expect(domande.length).toBe(2);
    expect(domande[0].tipo).toBe('scelta_singola');
    expect(domande[0].risposte[1].corretta).toBe(true);
    expect(domande[1].tipo).toBe('scelta_multipla');
    expect(domande[1].risposte.filter((r) => r.corretta).length).toBe(2);
  });
  it('CSV senza colonna Corretta → errore', () => {
    expect(parseQuizCsv('Domanda;Risposta A;Risposta B\nQ;a;b\n').errori[0]).toContain('Corretta');
  });
});
