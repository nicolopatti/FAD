import type { ReportFondoDataset } from './report-fondo';

// ===========================================================================
// Fase 4 — Task 4/5: adattatori di formato (dataset neutro → file).
//
// Eredità di D7 (motore unico + adattatori intercambiabili), ribaltata sul lato
// output: il motore di aggregazione (Task 2) è uno solo; ogni fondo è una "bocca
// di uscita" diversa. Aggiungere un formato NON tocca il motore.
//
// ⚠️ FORMATO INTERIM. Il brief §10 impone di recepire il TRACCIATO UFFICIALE
// AGGIORNATO di Fondimpresa/FonCoop (cambia per avviso) PRIMA di dichiarare il
// formato conforme (M4a #4) — è un prerequisito esterno (runbook), come il setup
// Teams della Fase 3. Finché quel tracciato non è disponibile, gli adattatori qui
// producono un CSV COMPLETO ma NON ufficiale (`ufficiale: false`): contiene tutti
// i dati di rendicontazione, ma intestazioni/ordine colonne NON sono il tracciato
// del fondo. La UI lo segnala; il `formato` dello snapshot lo registra.
// ===========================================================================

export type ReportFondoFile = {
  filename: string;
  mime: string;
  contenuto: string;
};

export type ReportFondoAdapter = {
  fondo: string; // chiave: 'fondimpresa' | 'foncoop'
  etichetta: string; // nome leggibile per la UI
  ufficiale: boolean; // false finché non si recepisce il tracciato ufficiale (§10)
  genera: (dataset: ReportFondoDataset) => ReportFondoFile;
};

// --- Serializzatore CSV minimale (zero dipendenze, gemello del parser csv.ts) -
function csvField(v: string | number | boolean | null | undefined, delim: string): string {
  const s = v == null ? '' : String(v);
  if (s.includes(delim) || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function csvRows(rows: (string | number | boolean | null | undefined)[][], delim = ';'): string {
  // CRLF + BOM: massima compatibilità con Excel italiano (come i CSV dei portali).
  return '﻿' + rows.map((r) => r.map((c) => csvField(c, delim)).join(delim)).join('\r\n') + '\r\n';
}

function idoneoLabel(i: ReportFondoDataset['iscritti'][number]): string {
  return i.idoneo ? 'SI' : 'NO';
}

// --- Tracciato tabulare comune (interim) condiviso dagli adattatori ----------
// Una riga per iscritto; i campi di testata (fondo/avviso/CUP/piano) sono ripetuti
// per riga, scelta robusta per un CSV piatto. Diventerà il tracciato per-avviso
// quando si recepirà la documentazione ufficiale (§10).
function righeRendicontazione(dataset: ReportFondoDataset): (string | number | null)[][] {
  const t = dataset.testata;
  const header = [
    'Fondo',
    'Avviso',
    'CUP',
    'CodicePiano',
    'Edizione',
    'Corso',
    'Cognome',
    'Nome',
    'CodiceFiscale',
    'Azienda',
    'PartitaIVA',
    'OreFrequentate',
    'FrequenzaPercentuale',
    'Idoneo',
  ];
  const righe: (string | number | null)[][] = [header];
  for (const i of dataset.iscritti) {
    righe.push([
      t.fondo,
      t.avviso,
      t.cup,
      t.piano_codice,
      t.edizione_codice,
      t.corso_titolo,
      i.cognome,
      i.nome,
      i.codice_fiscale,
      i.azienda_ragione_sociale,
      i.azienda_partita_iva,
      i.ore_frequentate,
      i.frequenza_percentuale,
      idoneoLabel(i),
    ]);
  }
  return righe;
}

const adapterFondimpresa: ReportFondoAdapter = {
  fondo: 'fondimpresa',
  etichetta: 'Fondimpresa (CSV interim)',
  ufficiale: false,
  genera(dataset) {
    return {
      filename: `fondimpresa_INTERIM_${dataset.testata.edizione_codice}.csv`,
      mime: 'text/csv;charset=utf-8',
      contenuto: csvRows(righeRendicontazione(dataset)),
    };
  },
};

// Registry. Task 5 aggiungerà 'foncoop' sullo STESSO motore (solo un altro
// adattatore qui sotto, nessuna modifica a report-fondo.ts).
const ADAPTERS: Record<string, ReportFondoAdapter> = {
  fondimpresa: adapterFondimpresa,
};

export function getAdapter(formato: string): ReportFondoAdapter | null {
  return ADAPTERS[formato] ?? null;
}

export function formatiDisponibili(): ReportFondoAdapter[] {
  return Object.values(ADAPTERS);
}
