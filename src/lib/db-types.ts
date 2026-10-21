/**
 * Tipi di riga delle query relazionali Supabase usate dalle pagine.
 * Le forme corrispondono al `.select('… foreign:fk ( … )')` annidato;
 * per FK 1:1 il campo embedded è un oggetto (o null se la riga referenziata
 * manca / non è leggibile via RLS).
 */

export type CorsoMini = {
  id: string;
  titolo: string;
  descrizione?: string | null;
  categoria?: string | null;
  cover_path?: string | null;
};

export type EdizioneConCorso = {
  id: string;
  codice: string;
  corso: CorsoMini | null;
};

export type IscrizioneListaRow = {
  id: string;
  edizione_id: string;
  edizione: EdizioneConCorso | null;
};

export type PersonaMini = {
  nome: string;
  cognome: string;
  email: string;
};

export type IscrizioneAuditRow = {
  id: string;
  persona_id: string;
  edizione_id: string;
  persona: PersonaMini | null;
  edizione: EdizioneConCorso | null;
};

export type EventoRow = {
  id: string;
  seq: number;
  event_type: string;
  occurred_at: string;
  actor: { persona_id?: string; type?: string } | null;
  subject_type: string;
  subject_id: string | null;
  payload: Record<string, unknown> | null;
  prev_hash: string | null;
  hash: string | null;
};

export type PoliticaAttestato = 'automatica' | 'manuale' | 'nessuna';

export const POLITICA_ATTESTATO_LABEL: Record<PoliticaAttestato, string> = {
  automatica: 'Automatico al completamento',
  manuale: 'Emesso dall’amministratore',
  nessuna: 'Nessun attestato',
};

/** Riga di `attestato` (snapshot write-once, Fase 5). */
export type AttestatoRow = {
  id: string;
  tenant_id: string;
  iscrizione_id: string;
  persona_id: string;
  corso_id: string;
  edizione_id: string;
  anno: number;
  progressivo: number;
  numero: string;
  codice_verifica: string;
  contenuto: Record<string, unknown>;
  hash: string;
  pdf_path: string;
  emesso_at: string;
  emesso_da: string | null;
  sostituisce: string | null;
  sostituito_da: string | null;
};

/** Dati dell'ente emittente su `tenant` (Fase 5). */
export type EnteRow = {
  id: string;
  nome: string;
  ragione_sociale: string | null;
  logo_path: string | null;
  firmatario_nome: string | null;
  firmatario_ruolo: string | null;
  firma_path: string | null;
  citta: string | null;
  linkedin_organization_id: string | null;
};

export type LearningObjectType = 'video' | 'documento' | 'quiz';

export const LO_TYPE_LABEL: Record<LearningObjectType, string> = { video: 'Video', documento: 'Documento', quiz: 'Test' };

export type LearningObjectMini = {
  titolo: string;
  type: LearningObjectType;
  config: Record<string, unknown>;
};

export type LearningObjectRow = {
  id: string;
  tenant_id: string;
  type: LearningObjectType;
  titolo: string;
  config: Record<string, unknown>;
  archiviato_at: string | null;
  creato_il: string;
};

export type VideoConfig = {
  vimeo_id: string; // sempre l'ID numerico (mai il link): vedi lib/vimeo.ts
  vimeo_hash?: string; // hash di privacy dei video "non in elenco" (parametro h)
  durata_secondi: number;
};

export type DocumentoConfig = {
  storage_key: string;
  mime: 'application/pdf';
  size: number;
  filename?: string;
};

// Test finale (Fase 5): le domande stanno in `quiz_domanda`; qui solo le regole.
export type QuizConfig = {
  soglia_percentuale: number; // 0–100, superato se percentuale ≥ soglia
  tentativi_max: number | null; // null = illimitati
  ordine_casuale: boolean;
  mostra_correzione: boolean; // mostra le risposte giuste dopo un tentativo superato
};

export type QuizTipoDomanda = 'scelta_singola' | 'scelta_multipla';
export type QuizRisposta = { testo: string; corretta?: boolean };
export type QuizDomandaRow = {
  id: string;
  learning_object_id: string;
  ordine: number;
  testo: string;
  tipo: QuizTipoDomanda;
  risposte: QuizRisposta[];
};

export type CorsoRow = {
  id: string;
  tenant_id: string;
  titolo: string;
  descrizione: string | null;
  sblocco_sequenziale: boolean;
  visione_integrale: boolean; // video completato solo a copertura ≥ 95% + ended (lib/visione.ts)
  categoria: string | null;
  cover_path: string | null;
  // Fase 5 — dati dell'attestato (congelati con D22; ore e riferimento compilabili da vuoto)
  ore_totali?: number | string | null;
  riferimento_normativo?: string | null;
  politica_attestato?: PoliticaAttestato;
  attestato_modello?: unknown;   // modello parziale del corso (lib/attestato-modello.ts), null = ente
  soglia_frequenza_percentuale?: number | string | null; // presenza minima alle sessioni live (congelata con D22)
  creato_il: string;
};

export type RegolaCompletamento = { tipo: 'video_ended' } | { tipo: 'documento_completed' } | { tipo: 'quiz_passed' };

export type StrutturaCorsoRow = {
  id: string;
  tenant_id: string;
  corso_id: string;
  learning_object_id: string;
  ordine: number;
  obbligatorio: boolean;
  regola_completamento: RegolaCompletamento;
};

export type StrutturaCorsoConLO = StrutturaCorsoRow & {
  learning_object: LearningObjectMini | null;
};

export type EdizioneRow = {
  id: string;
  tenant_id: string;
  corso_id: string;
  codice: string;
  data_inizio: string | null;
  data_fine: string | null;
  fad_apertura: string | null;
  fad_chiusura: string | null;
  concluso_at: string | null;
  annullato_at: string | null;
  creato_il: string;
};

export function edizioneStato(e: Pick<EdizioneRow, 'concluso_at' | 'annullato_at'>): 'attiva' | 'conclusa' | 'annullata' {
  if (e.annullato_at) return 'annullata';
  if (e.concluso_at) return 'conclusa';
  return 'attiva';
}

/**
 * Stato del corso derivato dalle edizioni (niente colonna): bozza = nessuna
 * edizione (modificabile), attivo = almeno un'edizione aperta, concluso = solo
 * edizioni concluse o annullate. "Congelato" (D22) resta il termine tecnico del
 * registro: in interfaccia si parla di corso attivo o concluso.
 */
export type StatoCorso = 'bozza' | 'attivo' | 'concluso' | 'archiviato';
export const STATI_CORSO: StatoCorso[] = ['bozza', 'attivo', 'concluso', 'archiviato'];
export function corsoStato(edizioni: Pick<EdizioneRow, 'concluso_at' | 'annullato_at'>[], archiviatoAt?: string | null): StatoCorso {
  if (archiviatoAt) return 'archiviato';
  if (edizioni.length === 0) return 'bozza';
  return edizioni.some((e) => edizioneStato(e) === 'attiva') ? 'attivo' : 'concluso';
}
export const STATO_CORSO_LABEL: Record<StatoCorso, string> = { bozza: 'Bozza', attivo: 'Attivo', concluso: 'Concluso', archiviato: 'Archiviato' };
export const STATO_CORSO_CHIP: Record<StatoCorso, string> = { bozza: 'chip--ocra', attivo: 'chip--ok', concluso: 'chip--muted', archiviato: 'chip--muted' };

// --- Ondata C — viste di riepilogo (security_invoker) e anagrafiche ---------
/** Riga della vista `corso_riepilogo`: il corso con i conteggi, per liste filtrate e paginate sul server. */
export type CorsoRiepilogo = {
  id: string;
  tenant_id: string;
  titolo: string;
  descrizione: string | null;
  categoria: string | null;
  cover_path: string | null;
  sblocco_sequenziale: boolean;
  visione_integrale: boolean;
  politica_attestato: PoliticaAttestato | null;
  ore_totali: number | string | null;
  creato_il: string;
  archiviato_at: string | null;
  n_lezioni: number;
  durata_sec: number;
  n_edizioni: number;
  n_edizioni_attive: number;
  n_iscritti: number;
  stato: StatoCorso;
};

/** Riga della vista `edizione_riepilogo`: l'edizione con i conteggi di prontezza. */
export type EdizioneRiepilogo = EdizioneRow & {
  stato: 'attiva' | 'conclusa' | 'annullata';
  n_iscritti: number;
  n_con_piano: number;
  n_sessioni: number;
  n_sessioni_future: number;
  n_da_riconciliare: number;
  n_attestati: number;
  n_incarichi: number;
};

export type CategoriaRow = { id: string; tenant_id: string; nome: string; ordine: number; creato_il: string };

export type AziendaRow = {
  id: string;
  tenant_id: string;
  ragione_sociale: string;
  partita_iva: string | null;
  codice_fiscale: string | null;
  codice_ateco: string | null;
  sede_indirizzo: string | null;
  sede_cap: string | null;
  sede_comune: string | null;
  sede_provincia: string | null;
  creato_il: string;
};
export type AziendaRiepilogo = AziendaRow & { n_iscrizioni: number; n_persone: number };

export type PersonaRiepilogo = {
  id: string;
  tenant_id: string;
  nome: string;
  cognome: string;
  email: string;
  codice_fiscale: string | null;
  data_nascita: string | null;
  luogo_nascita: string | null;
  auth_user_id: string | null;
  creato_il: string;
  accesso: boolean;
  n_iscrizioni: number;
  n_attestati: number;
  n_incarichi: number;
  ultima_iscrizione_il: string | null;
};

// --- Fase 3 — Incarichi (docenti e tutor di un'edizione, D30) ----------------

export type IncaricoRuolo = 'docente' | 'tutor_contenuto' | 'tutor_processo' | 'responsabile_progetto';
export const INCARICO_RUOLI: IncaricoRuolo[] = ['docente', 'tutor_contenuto', 'tutor_processo', 'responsabile_progetto'];
export const INCARICO_RUOLO_LABEL: Record<IncaricoRuolo, string> = {
  docente: 'Docente',
  tutor_contenuto: 'Tutor di contenuto',
  tutor_processo: 'Tutor di processo',
  responsabile_progetto: 'Responsabile di progetto',
};
/** Ruoli che possono tenere una sessione (trigger D30). */
export const RUOLI_DIDATTICI: IncaricoRuolo[] = ['docente', 'tutor_contenuto', 'tutor_processo'];

export type IncaricoConPersona = {
  id: string;
  edizione_id: string;
  persona_id: string;
  ruolo: IncaricoRuolo;
  persona: PersonaMini | null;
};

export type StrutturaRow = {
  id: string;
  ordine: number;
  obbligatorio: boolean;
  regola_completamento: { tipo: string };
  learning_object_id: string;
  learning_object: LearningObjectMini | null;
};

// --- Fase 3 — Gruppo 3 (Sessione) + Report di partecipazione grezzo ---------

export type SessioneModalita = 'aula' | 'vcs';
export type VcsPiattaforma = 'teams' | 'zoom';
export type ReportFonte = 'api_teams' | 'api_zoom' | 'csv';

export type SessioneRow = {
  id: string;
  tenant_id: string;
  edizione_id: string;
  titolo: string;
  data_ora: string | null;
  durata_minuti: number | null;
  modalita: SessioneModalita;
  vcs_piattaforma: VcsPiattaforma | null;
  vcs_meeting_id: string | null;
  incarico_id: string | null;
  annullato_at: string | null;
  creato_il: string;
};

export type SessioneConEdizione = SessioneRow & {
  edizione: EdizioneConCorso | null;
};

// Riga del grezzo come letta in UID admin (senza `contenuto`, che è PII di staging).
export type GrezzoMetaRow = {
  id: string;
  sessione_id: string;
  fonte: ReportFonte;
  importato_da: string | null;
  creato_il: string;
};
