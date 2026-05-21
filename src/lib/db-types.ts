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

export type LearningObjectMini = {
  titolo: string;
  type: 'video';
  config: Record<string, unknown>;
};

export type StrutturaRow = {
  id: string;
  ordine: number;
  obbligatorio: boolean;
  regola_completamento: { tipo: string };
  learning_object_id: string;
  learning_object: LearningObjectMini | null;
};
