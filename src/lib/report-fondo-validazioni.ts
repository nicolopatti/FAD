import type { ReportFondoDataset } from './report-fondo';

// ===========================================================================
// Fase 4 — Task 3: validazioni di conformità (D33).
//
// Sopra il dataset neutro (Task 2) calcola una lista di WARNING. La generazione
// dell'anteprima e del file è SEMPRE consentita (la decisione resta all'operatore,
// §10); i warning si vedono nell'anteprima e NON producono Eventi. La severità:
//   • bloccante → richiede un override esplicito prima di DEPOSITARE lo snapshot
//                 definitivo (Task 6); non impedisce l'anteprima.
//   • avviso    → segnalazione, non blocca nulla.
//
// Policy ratificata (decisione utente, §10):
//   • CUP mancante sul Piano            → BLOCCANTE (D32)
//   • CF mancante su un iscritto        → BLOCCANTE
//   • iscritto finanziato senza azienda → avviso (proxy appartenenza azienda↔fondo:
//        nel modello NON esiste un campo "aderente al fondo", §10)
//   • azienda senza partita IVA         → avviso
//   • avviso del Piano non valorizzato  → avviso (il tracciato si parametrizza
//        sull'avviso; in assenza l'adattatore usa il default)
// ===========================================================================

export type WarningSeverita = 'bloccante' | 'avviso';

export type ReportFondoWarning = {
  codice: string;
  severita: WarningSeverita;
  messaggio: string;
  iscrizione_id?: string; // valorizzato per i warning riferiti a un iscritto
};

function vuoto(s: string | null | undefined): boolean {
  return s == null || s.trim().length === 0;
}

export function validateReportFondo(dataset: ReportFondoDataset): ReportFondoWarning[] {
  const warnings: ReportFondoWarning[] = [];
  const t = dataset.testata;

  // --- Testata del Piano ----------------------------------------------------
  if (vuoto(t.cup)) {
    warnings.push({
      codice: 'cup_mancante',
      severita: 'bloccante',
      messaggio: `CUP mancante sul Piano "${t.piano_titolo}": obbligatorio sui documenti amministrativi del fondo (D32).`,
    });
  }
  if (vuoto(t.avviso)) {
    warnings.push({
      codice: 'avviso_mancante',
      severita: 'avviso',
      messaggio: `Avviso non valorizzato sul Piano "${t.piano_titolo}": il tracciato del formato userà l'impostazione di default.`,
    });
  }

  // --- Per iscritto ---------------------------------------------------------
  for (const i of dataset.iscritti) {
    const chi = `${i.cognome ?? ''} ${i.nome ?? ''}`.trim() || i.iscrizione_id;

    if (vuoto(i.codice_fiscale)) {
      warnings.push({
        codice: 'cf_mancante',
        severita: 'bloccante',
        messaggio: `Codice fiscale mancante per ${chi}: campo chiave del tracciato fondo.`,
        iscrizione_id: i.iscrizione_id,
      });
    }

    if (i.azienda_id == null) {
      warnings.push({
        codice: 'iscritto_finanziato_senza_azienda',
        severita: 'avviso',
        messaggio: `${chi} è su un piano finanziato ma senza azienda: verificare l'appartenenza a un'impresa aderente al fondo.`,
        iscrizione_id: i.iscrizione_id,
      });
    } else if (vuoto(i.azienda_partita_iva)) {
      warnings.push({
        codice: 'azienda_senza_piva',
        severita: 'avviso',
        messaggio: `Azienda "${i.azienda_ragione_sociale ?? '—'}" di ${chi} senza partita IVA: dati impresa incompleti per la rendicontazione.`,
        iscrizione_id: i.iscrizione_id,
      });
    }
  }

  return warnings;
}

export function hasBloccanti(warnings: ReportFondoWarning[]): boolean {
  return warnings.some((w) => w.severita === 'bloccante');
}

export function contaSeverita(warnings: ReportFondoWarning[]): { bloccanti: number; avvisi: number } {
  let bloccanti = 0;
  let avvisi = 0;
  for (const w of warnings) {
    if (w.severita === 'bloccante') bloccanti += 1;
    else avvisi += 1;
  }
  return { bloccanti, avvisi };
}
