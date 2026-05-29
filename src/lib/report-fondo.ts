import type { SupabaseClient } from '@supabase/supabase-js';
import { computeProgressoForIscrizione, computeFrequenzaForIscrizione } from './compliance';

// ===========================================================================
// Fase 4 — Task 2: motore di aggregazione del report fondo (format-agnostic).
//
// Data una coppia (Edizione, Piano), ricostruisce il DATASET NEUTRO di
// rendicontazione DAGLI EVENTI (non dalle colonne-cache): risolve l'anagrafica
// "al momento" (nome/CF/email/azienda), ricalcola ore/frequenza/completamento
// riusando compliance.ts, raccoglie le sessioni col docente di giornata e monta
// la testata del Piano. Non sa nulla del formato di destinazione: gli adattatori
// (Task 4/5) traducono questa struttura.
//
// Gira sotto il client RLS-scoped del chiamante (admin/auditor): un'Edizione o un
// Piano di un altro tenant non è leggibile → ritorna null (M4a #6, isolamento a
// livello DB). Nessuno stato di compliance proprio: ricalcola, non memorizza
// (D8/D18/D35). PII (nome/CF) nel dataset-output: legittima (è il documento per
// il fondo); MAI nel log — l'Evento di deposito (Task 6) porta solo l'hash.
// ===========================================================================

export type ReportFondoTestata = {
  edizione_id: string;
  edizione_codice: string;
  corso_id: string;
  corso_titolo: string;
  data_inizio: string | null;
  data_fine: string | null;
  soglia_frequenza_percentuale: number | null;
  piano_id: string;
  piano_titolo: string;
  piano_codice: string | null;
  fondo: string | null;
  avviso: string | null;
  canale: string | null;
  cup: string | null;
  piano_data_avvio: string | null;
  piano_data_chiusura: string | null;
};

// Da quale criterio deriva l'idoneità dell'iscritto:
//  - frequenza:     corso di presenza con soglia (nessun LO FAD obbligatorio)
//  - completamento: corso FAD (LO obbligatori, nessuna soglia di frequenza)
//  - misto:         blended (entrambi → servono entrambi)
//  - nessuno:       né soglia né obbligatori (idoneità non determinabile)
export type CriterioIdoneita = 'frequenza' | 'completamento' | 'misto' | 'nessuno';

export type ReportFondoIscritto = {
  iscrizione_id: string;
  persona_id: string;
  nome: string | null;
  cognome: string | null;
  codice_fiscale: string | null;
  email: string | null;
  azienda_id: string | null;
  azienda_ragione_sociale: string | null;
  azienda_partita_iva: string | null;
  azienda_codice_fiscale: string | null;
  azienda_codice_ateco: string | null;
  ore_frequentate: number;
  frequenza_percentuale: number;
  minuti_pianificati: number;
  obbligatori_completati: number;
  obbligatori_totale: number;
  criterio_idoneita: CriterioIdoneita;
  idoneo: boolean;
};

export type ReportFondoSessione = {
  sessione_id: string;
  titolo: string;
  data_ora: string | null;
  durata_minuti: number | null;
  modalita: 'aula' | 'vcs';
  annullata: boolean;
  docente: string | null; // "Nome Cognome" risolto al momento, o null (D30: incarico nullable)
};

export type ReportFondoDataset = {
  testata: ReportFondoTestata;
  iscritti: ReportFondoIscritto[];
  sessioni: ReportFondoSessione[];
  generato_at: string; // ISO: momento del calcolo (vista live)
};

type IscrizioneFondoRow = {
  id: string;
  persona_id: string;
  azienda_id: string | null;
  persona: { nome: string; cognome: string; email: string; codice_fiscale: string | null } | null;
  azienda: {
    ragione_sociale: string;
    partita_iva: string | null;
    codice_fiscale: string | null;
    codice_ateco: string | null;
  } | null;
};

type SessioneFondoRow = {
  id: string;
  titolo: string;
  data_ora: string | null;
  durata_minuti: number | null;
  modalita: 'aula' | 'vcs';
  annullato_at: string | null;
  incarico: { persona: { nome: string; cognome: string } | null } | null;
};

function deriveIdoneita(
  obbligatoriTotale: number,
  fadIdonea: boolean,
  soglia: number | null,
  frequenzaIdonea: boolean,
): { criterio: CriterioIdoneita; idoneo: boolean } {
  const fadOk = obbligatoriTotale === 0 || fadIdonea;
  const freqOk = soglia == null || frequenzaIdonea;
  let criterio: CriterioIdoneita;
  if (obbligatoriTotale > 0 && soglia != null) criterio = 'misto';
  else if (soglia != null) criterio = 'frequenza';
  else if (obbligatoriTotale > 0) criterio = 'completamento';
  else criterio = 'nessuno';
  const idoneo = criterio === 'nessuno' ? false : fadOk && freqOk;
  return { criterio, idoneo };
}

export async function computeReportFondoDataset(
  supabase: SupabaseClient,
  edizioneId: string,
  pianoId: string,
): Promise<ReportFondoDataset | null> {
  // --- Coordinate: Edizione + Corso + Piano (RLS: cross-tenant → null) -------
  const { data: edizione } = await supabase
    .from('edizione')
    .select('id, codice, data_inizio, data_fine, corso_id')
    .eq('id', edizioneId)
    .single();
  if (!edizione) return null;

  const { data: corso } = await supabase
    .from('corso')
    .select('id, titolo, soglia_frequenza_percentuale')
    .eq('id', edizione.corso_id)
    .single();
  if (!corso) return null;

  const { data: piano } = await supabase
    .from('piano_formativo_finanziato')
    .select('id, titolo, codice, fondo, avviso, canale, cup, data_avvio, data_chiusura')
    .eq('id', pianoId)
    .single();
  if (!piano) return null;

  // --- Iscritti della coppia (Edizione, Piano), anagrafica risolta al momento -
  const { data: iscrizioni } = await supabase
    .from('iscrizione')
    .select(
      `id, persona_id, azienda_id,
       persona:persona_id ( nome, cognome, email, codice_fiscale ),
       azienda:azienda_id ( ragione_sociale, partita_iva, codice_fiscale, codice_ateco )`,
    )
    .eq('edizione_id', edizioneId)
    .eq('piano_id', pianoId)
    .returns<IscrizioneFondoRow[]>();

  const iscritti: ReportFondoIscritto[] = [];
  for (const i of iscrizioni ?? []) {
    // Ricalcolo dagli Eventi (D8): completamento FAD + frequenza webinar.
    const [prog, freq] = await Promise.all([
      computeProgressoForIscrizione(supabase, i.id),
      computeFrequenzaForIscrizione(supabase, i.id),
    ]);
    const obbligatoriTot = prog?.obbligatori_totale ?? 0;
    const obbligatoriDone = prog?.obbligatori_completati ?? 0;
    const soglia = freq?.soglia ?? null;
    const { criterio, idoneo } = deriveIdoneita(
      obbligatoriTot,
      prog?.idonea ?? false,
      soglia,
      freq?.idoneo_frequenza ?? false,
    );
    iscritti.push({
      iscrizione_id: i.id,
      persona_id: i.persona_id,
      nome: i.persona?.nome ?? null,
      cognome: i.persona?.cognome ?? null,
      codice_fiscale: i.persona?.codice_fiscale ?? null,
      email: i.persona?.email ?? null,
      azienda_id: i.azienda_id,
      azienda_ragione_sociale: i.azienda?.ragione_sociale ?? null,
      azienda_partita_iva: i.azienda?.partita_iva ?? null,
      azienda_codice_fiscale: i.azienda?.codice_fiscale ?? null,
      azienda_codice_ateco: i.azienda?.codice_ateco ?? null,
      ore_frequentate: freq?.ore_frequentate ?? 0,
      frequenza_percentuale: freq?.frequenza_percentuale ?? 0,
      minuti_pianificati: freq?.minuti_pianificati ?? 0,
      obbligatori_completati: obbligatoriDone,
      obbligatori_totale: obbligatoriTot,
      criterio_idoneita: criterio,
      idoneo,
    });
  }
  // Ordine stabile (cognome, nome) → snapshot/hash deterministici.
  iscritti.sort(
    (a, b) =>
      (a.cognome ?? '').localeCompare(b.cognome ?? '') ||
      (a.nome ?? '').localeCompare(b.nome ?? '') ||
      a.iscrizione_id.localeCompare(b.iscrizione_id),
  );

  // --- Sessioni dell'Edizione + docente di giornata (se incarico valorizzato) -
  const { data: sessioni } = await supabase
    .from('sessione')
    .select(
      `id, titolo, data_ora, durata_minuti, modalita, annullato_at,
       incarico:incarico_id ( persona:persona_id ( nome, cognome ) )`,
    )
    .eq('edizione_id', edizioneId)
    .order('data_ora', { ascending: true })
    .returns<SessioneFondoRow[]>();

  const sessioniOut: ReportFondoSessione[] = (sessioni ?? []).map((s) => ({
    sessione_id: s.id,
    titolo: s.titolo,
    data_ora: s.data_ora,
    durata_minuti: s.durata_minuti,
    modalita: s.modalita,
    annullata: Boolean(s.annullato_at),
    docente: s.incarico?.persona ? `${s.incarico.persona.nome} ${s.incarico.persona.cognome}` : null,
  }));

  return {
    testata: {
      edizione_id: edizione.id,
      edizione_codice: edizione.codice,
      corso_id: corso.id,
      corso_titolo: corso.titolo,
      data_inizio: edizione.data_inizio,
      data_fine: edizione.data_fine,
      soglia_frequenza_percentuale:
        corso.soglia_frequenza_percentuale != null ? Number(corso.soglia_frequenza_percentuale) : null,
      piano_id: piano.id,
      piano_titolo: piano.titolo,
      piano_codice: piano.codice,
      fondo: piano.fondo,
      avviso: piano.avviso,
      canale: piano.canale,
      cup: piano.cup,
      piano_data_avvio: piano.data_avvio,
      piano_data_chiusura: piano.data_chiusura,
    },
    iscritti,
    sessioni: sessioniOut,
    generato_at: new Date().toISOString(),
  };
}
