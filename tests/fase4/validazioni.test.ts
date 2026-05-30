import { describe, it, expect } from 'vitest';
import {
  validateReportFondo,
  hasBloccanti,
  contaSeverita,
} from '../../src/lib/report-fondo-validazioni';
import type {
  ReportFondoDataset,
  ReportFondoIscritto,
  ReportFondoTestata,
} from '../../src/lib/report-fondo';

function testata(over: Partial<ReportFondoTestata> = {}): ReportFondoTestata {
  return {
    edizione_id: 'ed',
    edizione_codice: 'ED-1',
    corso_id: 'c',
    corso_titolo: 'Corso',
    data_inizio: null,
    data_fine: null,
    soglia_frequenza_percentuale: 80,
    piano_id: 'p',
    piano_titolo: 'Piano X',
    piano_codice: 'P-1',
    fondo: 'fondimpresa',
    avviso: 'Avviso 1/2026',
    canale: 'Conto Formazione',
    cup: 'B12C34000560006',
    piano_data_avvio: null,
    piano_data_chiusura: null,
    ...over,
  };
}

function iscritto(over: Partial<ReportFondoIscritto> = {}): ReportFondoIscritto {
  return {
    iscrizione_id: 'i1',
    persona_id: 'pp',
    nome: 'Mario',
    cognome: 'Bianchi',
    codice_fiscale: 'BNCMRA80A01F205X',
    email: 'm@x.it',
    azienda_id: 'a1',
    azienda_ragione_sociale: 'ACME S.r.l.',
    azienda_partita_iva: '01234567890',
    azienda_codice_fiscale: null,
    azienda_codice_ateco: '62.01',
    ore_frequentate: 2,
    frequenza_percentuale: 100,
    minuti_pianificati: 120,
    obbligatori_completati: 0,
    obbligatori_totale: 0,
    criterio_idoneita: 'frequenza',
    idoneo: true,
    ...over,
  };
}

function dataset(
  testataOver: Partial<ReportFondoTestata>,
  iscritti: ReportFondoIscritto[],
): ReportFondoDataset {
  return {
    testata: testata(testataOver),
    iscritti,
    sessioni: [],
    generato_at: '2026-05-29T00:00:00.000Z',
  };
}

describe('validateReportFondo (D33, policy §10)', () => {
  it('happy path: nessun warning, nessun bloccante', () => {
    const w = validateReportFondo(dataset({}, [iscritto()]));
    expect(w).toHaveLength(0);
    expect(hasBloccanti(w)).toBe(false);
  });

  it('CUP mancante → bloccante', () => {
    for (const cup of [null, '', '   ']) {
      const w = validateReportFondo(dataset({ cup }, [iscritto()]));
      expect(w.find((x) => x.codice === 'cup_mancante')?.severita).toBe('bloccante');
      expect(hasBloccanti(w)).toBe(true);
    }
  });

  it('CF mancante → bloccante, riferito all’iscritto', () => {
    const w = validateReportFondo(dataset({}, [iscritto({ codice_fiscale: null, iscrizione_id: 'iX' })]));
    const cf = w.find((x) => x.codice === 'cf_mancante');
    expect(cf?.severita).toBe('bloccante');
    expect(cf?.iscrizione_id).toBe('iX');
  });

  it('finanziato senza azienda → avviso (non bloccante)', () => {
    const w = validateReportFondo(
      dataset({}, [iscritto({ azienda_id: null, azienda_ragione_sociale: null, azienda_partita_iva: null })]),
    );
    expect(w.find((x) => x.codice === 'iscritto_finanziato_senza_azienda')?.severita).toBe('avviso');
    expect(hasBloccanti(w)).toBe(false);
  });

  it('azienda senza P.IVA → avviso (e non scatta se manca proprio l’azienda)', () => {
    const conAzienda = validateReportFondo(dataset({}, [iscritto({ azienda_partita_iva: null })]));
    expect(conAzienda.find((x) => x.codice === 'azienda_senza_piva')?.severita).toBe('avviso');
    // senza azienda: scatta l'altro warning, NON azienda_senza_piva
    const senzaAzienda = validateReportFondo(dataset({}, [iscritto({ azienda_id: null, azienda_partita_iva: null })]));
    expect(senzaAzienda.find((x) => x.codice === 'azienda_senza_piva')).toBeUndefined();
  });

  it('avviso del Piano non valorizzato → avviso', () => {
    const w = validateReportFondo(dataset({ avviso: null }, [iscritto()]));
    expect(w.find((x) => x.codice === 'avviso_mancante')?.severita).toBe('avviso');
  });

  it('conteggio severità con più problemi insieme', () => {
    const w = validateReportFondo(
      dataset({ cup: '' }, [
        iscritto({ iscrizione_id: 'a', codice_fiscale: null }),
        iscritto({ iscrizione_id: 'b', azienda_id: null, azienda_partita_iva: null }),
      ]),
    );
    const c = contaSeverita(w);
    expect(c.bloccanti).toBe(2); // cup + cf
    expect(c.avvisi).toBeGreaterThanOrEqual(1); // finanziato_senza_azienda
  });
});
