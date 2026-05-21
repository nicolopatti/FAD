import type { SupabaseClient } from '@supabase/supabase-js';
import type { StrutturaRow } from './db-types';

export type StrutturaItem = {
  struttura_id: string;
  learning_object_id: string;
  ordine: number;
  obbligatorio: boolean;
  regola_completamento: { tipo: string };
  lo_titolo: string;
  lo_type: 'video';
  lo_config: Record<string, unknown>;
};

export type ProgressoLO = StrutturaItem & {
  completato: boolean;
  sbloccato: boolean;
};

export type ProgressoIscrizione = {
  iscrizione_id: string;
  edizione_id: string;
  persona_id: string;
  corso_id: string;
  corso_titolo: string;
  sblocco_sequenziale: boolean;
  totale: number;
  completati: number;
  obbligatori_completati: number;
  obbligatori_totale: number;
  idonea: boolean;
  items: ProgressoLO[];
};

const COMPLETION_EVENT_FOR_RULE: Record<string, string> = {
  video_ended: 'video.ended',
};

export async function computeProgressoForIscrizione(
  supabase: SupabaseClient,
  iscrizioneId: string,
): Promise<ProgressoIscrizione | null> {
  const { data: iscrizione, error: errIscr } = await supabase
    .from('iscrizione')
    .select('id, persona_id, edizione_id')
    .eq('id', iscrizioneId)
    .single();
  if (errIscr || !iscrizione) return null;

  const { data: edizione, error: errEd } = await supabase
    .from('edizione')
    .select('id, corso_id')
    .eq('id', iscrizione.edizione_id)
    .single();
  if (errEd || !edizione) return null;

  const { data: corso, error: errCorso } = await supabase
    .from('corso')
    .select('id, titolo, sblocco_sequenziale')
    .eq('id', edizione.corso_id)
    .single();
  if (errCorso || !corso) return null;

  const { data: struttura, error: errStr } = await supabase
    .from('struttura_corso')
    .select(`
      id, ordine, obbligatorio, regola_completamento, learning_object_id,
      learning_object:learning_object_id ( titolo, type, config )
    `)
    .eq('corso_id', corso.id)
    .order('ordine', { ascending: true })
    .returns<StrutturaRow[]>();
  if (errStr || !struttura) return null;

  const items: StrutturaItem[] = struttura
    .filter((row) => row.learning_object !== null)
    .map((row) => ({
      struttura_id: row.id,
      learning_object_id: row.learning_object_id,
      ordine: row.ordine,
      obbligatorio: row.obbligatorio,
      regola_completamento: row.regola_completamento,
      lo_titolo: row.learning_object!.titolo,
      lo_type: row.learning_object!.type,
      lo_config: row.learning_object!.config,
    }));

  const loIds = items.map((i) => i.learning_object_id);

  // Eventi di completamento per la persona, sugli LO di questo corso.
  // Filtro sull'event_type "video.ended" perché in Fase 1 è la sola regola attiva.
  const completionTypes = Array.from(
    new Set(items.map((i) => COMPLETION_EVENT_FOR_RULE[i.regola_completamento.tipo])),
  ).filter(Boolean);
  type EventoCompletamento = {
    subject_id: string | null;
    event_type: string;
    actor: { persona_id?: string } | null;
  };

  const completedLoIds = new Set<string>();
  if (loIds.length && completionTypes.length) {
    const { data: events } = await supabase
      .from('evento')
      .select('subject_id, event_type, actor')
      .in('event_type', completionTypes)
      .in('subject_id', loIds)
      .returns<EventoCompletamento[]>();
    for (const e of events ?? []) {
      if (e.actor?.persona_id === iscrizione.persona_id && e.subject_id) {
        completedLoIds.add(e.subject_id);
      }
    }
  }

  // Calcolo sblocco sequenziale: un LO è sbloccato se tutti i precedenti
  // *obbligatori* sono completati (oppure il corso non ha sblocco sequenziale).
  let allMandatoryPreviousComplete = true;
  const decorated: ProgressoLO[] = items.map((it) => {
    const completato = completedLoIds.has(it.learning_object_id);
    const sbloccato = corso.sblocco_sequenziale ? allMandatoryPreviousComplete : true;
    if (it.obbligatorio && !completato) allMandatoryPreviousComplete = false;
    return { ...it, completato, sbloccato };
  });

  const totale = decorated.length;
  const completati = decorated.filter((x) => x.completato).length;
  const obbligatoriTot = decorated.filter((x) => x.obbligatorio).length;
  const obbligatoriCompletati = decorated.filter((x) => x.obbligatorio && x.completato).length;
  const idonea = obbligatoriCompletati === obbligatoriTot;

  return {
    iscrizione_id: iscrizione.id,
    edizione_id: iscrizione.edizione_id,
    persona_id: iscrizione.persona_id,
    corso_id: corso.id,
    corso_titolo: corso.titolo,
    sblocco_sequenziale: corso.sblocco_sequenziale,
    totale,
    completati,
    obbligatori_completati: obbligatoriCompletati,
    obbligatori_totale: obbligatoriTot,
    idonea,
    items: decorated,
  };
}

export async function isLoSbloccato(
  supabase: SupabaseClient,
  iscrizioneId: string,
  learningObjectId: string,
): Promise<boolean> {
  const progresso = await computeProgressoForIscrizione(supabase, iscrizioneId);
  if (!progresso) return false;
  const item = progresso.items.find((i) => i.learning_object_id === learningObjectId);
  return Boolean(item?.sbloccato);
}
