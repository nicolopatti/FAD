import { describe, it, expect } from 'vitest';
import { getAdapter, formatiDisponibili, csvRows } from '../../src/lib/report-fondo-formati';
import type { ReportFondoDataset, ReportFondoIscritto } from '../../src/lib/report-fondo';

function ds(iscritti: Partial<ReportFondoIscritto>[]): ReportFondoDataset {
  return {
    testata: {
      edizione_id: 'ed',
      edizione_codice: 'ED-WEB-2026',
      corso_id: 'c',
      corso_titolo: 'Sicurezza',
      data_inizio: null,
      data_fine: null,
      soglia_frequenza_percentuale: 80,
      piano_id: 'p',
      piano_titolo: 'Piano 2026',
      piano_codice: 'BANDO-2026-01',
      fondo: 'fondimpresa',
      avviso: 'Avviso 1/2026',
      canale: 'Conto Formazione',
      cup: 'B12C34000560006',
      piano_data_avvio: null,
      piano_data_chiusura: null,
    },
    iscritti: iscritti.map((o, idx) => ({
      iscrizione_id: `i${idx}`,
      persona_id: `p${idx}`,
      nome: 'Mario',
      cognome: 'Bianchi',
      codice_fiscale: 'CF',
      email: 'm@x.it',
      azienda_id: 'a',
      azienda_ragione_sociale: 'ACME S.r.l.',
      azienda_partita_iva: '01234567890',
      azienda_codice_fiscale: null,
      azienda_codice_ateco: null,
      ore_frequentate: 2,
      frequenza_percentuale: 100,
      minuti_pianificati: 120,
      obbligatori_completati: 0,
      obbligatori_totale: 0,
      criterio_idoneita: 'frequenza',
      idoneo: true,
      ...o,
    })),
    sessioni: [],
    generato_at: '2026-05-29T00:00:00.000Z',
  };
}

describe('adapter Fondimpresa (interim)', () => {
  it('è registrato ma marcato non ufficiale (tracciato §10 da recepire)', () => {
    const a = getAdapter('fondimpresa');
    expect(a).not.toBeNull();
    expect(a!.ufficiale).toBe(false);
    expect(formatiDisponibili().length).toBeGreaterThanOrEqual(1);
  });

  it('getAdapter ritorna null per un formato sconosciuto', () => {
    expect(getAdapter('zzz')).toBeNull();
  });

  it('genera CSV con header + una riga per iscritto, BOM e CRLF', () => {
    const a = getAdapter('fondimpresa')!;
    const f = a.genera(
      ds([
        { cognome: 'Bianchi', nome: 'Mario', idoneo: true },
        { cognome: 'Verdi', nome: 'Lucia', idoneo: false, frequenza_percentuale: 91.67 },
      ]),
    );
    expect(f.filename).toContain('fondimpresa_INTERIM_ED-WEB-2026');
    expect(f.mime).toContain('text/csv');
    expect(f.contenuto.startsWith('﻿')).toBe(true); // BOM
    const righe = f.contenuto.replace(/^﻿/, '').trimEnd().split('\r\n');
    expect(righe).toHaveLength(3); // header + 2 iscritti
    expect(righe[0].split(';')[0]).toBe('Fondo');
    expect(righe[0]).toContain('CodiceFiscale');
    expect(righe[1]).toContain('Bianchi');
    expect(righe[1].endsWith(';SI')).toBe(true);
    expect(righe[2].endsWith(';NO')).toBe(true);
    expect(righe[2]).toContain('91.67');
  });

  it('quota i campi che contengono delimitatore o virgolette', () => {
    const line = csvRows([['a', 'b;c', 'd"e']]).replace(/^﻿/, '').trimEnd();
    expect(line).toBe('a;"b;c";"d""e"');
  });

  it('CUP e CF compaiono nel file (PII nel documento è corretto, D18)', () => {
    const a = getAdapter('fondimpresa')!;
    const f = a.genera(ds([{ codice_fiscale: 'BNCMRA80A01F205X' }]));
    expect(f.contenuto).toContain('B12C34000560006'); // CUP (testata)
    expect(f.contenuto).toContain('BNCMRA80A01F205X'); // CF (iscritto)
  });
});
