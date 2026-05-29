/**
 * Tipi di riga delle query relazionali Supabase usate dalle pagine.
 * Le forme corrispondono al `.select('… foreign:fk ( … )')` annidato;
 * per FK 1:1 il campo embedded è un oggetto (o null se la riga referenziata
 * manca / non è leggibile via RLS).
 */

export type CorsoMini = { id: string; titolo: string };

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

export type LearningObjectType = 'video' | 'documento';

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
  vimeo_id: string;
  durata_secondi: number;
};

export type DocumentoConfig = {
  storage_key: string;
  mime: 'application/pdf';
  size: number;
  filename?: string;
};

export type CorsoRow = {
  id: string;
  tenant_id: string;
  titolo: string;
  descrizione: string | null;
  sblocco_sequenziale: boolean;
  creato_il: string;
};

export type RegolaCompletamento = { tipo: 'video_ended' } | { tipo: 'documento_completed' };

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
