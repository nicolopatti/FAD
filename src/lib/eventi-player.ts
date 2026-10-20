import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Eventi del player in UNA chiamata (Blocco B #5): la RPC `evento_player_registra`
 * verifica titolarità dell'iscrizione, contenuto in struttura e del tipo giusto,
 * sblocco sequenziale per Eventi (D26) e scrive l'Evento via audit_append con
 * il client dell'utente (RLS + JWT): nessuna service role sul percorso caldo.
 * I corsi a visione integrale hanno in più il controllo di copertura, che il
 * server applicativo fa PRIMA con compliance.ts (lib/visione.ts).
 */
export type EsitoRegistrazione = { evento_id: string; seq: number; persona_id: string; tenant_id: string };

export class ErroreRegistrazione extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function registraEventoPlayer(
  supabase: SupabaseClient,
  input: { iscrizioneId: string; learningObjectId: string; eventType: string; payload?: Record<string, unknown> },
): Promise<EsitoRegistrazione> {
  const { data, error } = await supabase.rpc('evento_player_registra', {
    p_iscrizione_id: input.iscrizioneId,
    p_learning_object_id: input.learningObjectId,
    p_event_type: input.eventType,
    p_payload: input.payload ?? {},
  });
  if (error) {
    const msg = error.message.replace(/^evento_player_registra: /, '');
    const status = /non autenticato/.test(msg) ? 401
      : /non sbloccato|iscrizione non valida|LO non in corso|non coerente/.test(msg) ? 403
        : /non ammesso/.test(msg) ? 400 : 500;
    throw new ErroreRegistrazione(msg, status);
  }
  return data as EsitoRegistrazione;
}
