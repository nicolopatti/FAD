import type { SupabaseClient } from '@supabase/supabase-js';
import type { LearningObjectType, StrutturaRow } from './db-types';

export type StrutturaItem = {
  struttura_id: string;
  learning_object_id: string;
  ordine: number;
  obbligatorio: boolean;
  regola_completamento: { tipo: string };
  lo_titolo: string;
  lo_type: LearningObjectType;
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
  documento_completed: 'documento.completed',
};

// Etichetta leggibile della regola di completamento per la UI di audit (D35).
// Stesso vocabolario di COMPLETION_EVENT_FOR_RULE: "visione/lettura integrale".
export function regolaLabel(tipo: string): string {
  switch (tipo) {
    case 'video_ended':
      return 'visione integrale';
    case 'documento_completed':
      return 'lettura integrale';
    default:
      return tipo;
  }
}

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

// ---------------------------------------------------------------------------
// Frequenza webinar (Fase 3, D8/D33, M3a #9). La presenza è un Evento
// (`presenza_webinar_registrata`), non uno stato: la frequenza si RICALCOLA
// dagli Eventi, indipendente dalle colonne-cache dell'Iscrizione.
// La durata nel payload è "come ricevuta" (stringa): la si interpreta qui.
// ---------------------------------------------------------------------------

// Interpreta una durata grezza in MINUTI. Formati gestiti: numero puro
// (minuti, anche con virgola), "H:MM:SS", testuale "Xh Ym Zs" (sottoinsiemi).
// Ritorna null se non interpretabile (verrà conteggiata come 0 e segnalata).
export function parseDurataMinuti(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (/^\d+([.,]\d+)?$/.test(s)) return parseFloat(s.replace(',', '.'));
  const colon = s.match(/^(\d+):(\d{1,2}):(\d{1,2})$/); // H:MM:SS
  if (colon) {
    return parseInt(colon[1], 10) * 60 + parseInt(colon[2], 10) + parseInt(colon[3], 10) / 60;
  }
  const h = s.match(/(\d+)\s*h/);
  const m = s.match(/(\d+)\s*m(?!s)/);
  const sec = s.match(/(\d+)\s*s/);
  if (h || m || sec) {
    return (h ? parseInt(h[1], 10) * 60 : 0) + (m ? parseInt(m[1], 10) : 0) + (sec ? parseInt(sec[1], 10) / 60 : 0);
  }
  return null;
}

export type FrequenzaIscrizione = {
  iscrizione_id: string;
  edizione_id: string;
  soglia: number | null; // corso.soglia_frequenza_percentuale (null = nessun requisito)
  sessioni_totali: number;
  minuti_pianificati: number;
  minuti_frequentati: number;
  ore_frequentate: number;
  frequenza_percentuale: number;
  presenze: number;
  durate_non_parsate: number;
  idoneo_frequenza: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function computeFrequenzaForIscrizione(
  supabase: SupabaseClient,
  iscrizioneId: string,
): Promise<FrequenzaIscrizione | null> {
  const { data: iscrizione } = await supabase
    .from('iscrizione')
    .select('id, edizione_id')
    .eq('id', iscrizioneId)
    .single();
  if (!iscrizione) return null;

  const { data: edizione } = await supabase
    .from('edizione')
    .select('id, corso_id')
    .eq('id', iscrizione.edizione_id)
    .single();
  if (!edizione) return null;

  const { data: corso } = await supabase
    .from('corso')
    .select('id, soglia_frequenza_percentuale')
    .eq('id', edizione.corso_id)
    .single();

  // Sessioni (non annullate) dell'Edizione → minuti pianificati per sessione.
  const { data: sessioni } = await supabase
    .from('sessione')
    .select('id, durata_minuti, annullato_at')
    .eq('edizione_id', iscrizione.edizione_id)
    .returns<{ id: string; durata_minuti: number | null; annullato_at: string | null }[]>();

  const plannedBySessione = new Map<string, number>();
  let minutiPianificati = 0;
  for (const s of sessioni ?? []) {
    if (s.annullato_at) continue;
    const p = s.durata_minuti ?? 0;
    plannedBySessione.set(s.id, p);
    minutiPianificati += p;
  }

  // Eventi di presenza per questa Iscrizione. subject_id = sessione.
  type PresEvt = { subject_id: string | null; payload: { durata?: string | null } | null };
  const { data: eventi } = await supabase
    .from('evento')
    .select('subject_id, payload')
    .eq('event_type', 'presenza_webinar_registrata')
    .eq('payload->>iscrizione_id', iscrizioneId)
    .returns<PresEvt[]>();

  // Per ogni sessione, prendi la MAX durata registrata (no doppio conteggio se
  // ci sono più report per la stessa sessione), limitata al pianificato.
  const attendedBySessione = new Map<string, number>();
  let durateNonParsate = 0;
  for (const e of eventi ?? []) {
    if (!e.subject_id) continue;
    const min = parseDurataMinuti(e.payload?.durata ?? null);
    if (min == null) { durateNonParsate += 1; continue; }
    const prev = attendedBySessione.get(e.subject_id) ?? 0;
    if (min > prev) attendedBySessione.set(e.subject_id, min);
  }

  let minutiFrequentati = 0;
  for (const [sessioneId, attended] of attendedBySessione) {
    const planned = plannedBySessione.get(sessioneId);
    // limita al pianificato (i rientri possono gonfiare oltre la durata)
    minutiFrequentati += planned != null ? Math.min(attended, planned) : attended;
  }

  const soglia = corso?.soglia_frequenza_percentuale ?? null;
  const frequenza = minutiPianificati > 0 ? round2((minutiFrequentati / minutiPianificati) * 100) : 0;
  const idoneo = soglia != null && frequenza >= Number(soglia);

  return {
    iscrizione_id: iscrizione.id,
    edizione_id: iscrizione.edizione_id,
    soglia: soglia != null ? Number(soglia) : null,
    sessioni_totali: plannedBySessione.size,
    minuti_pianificati: minutiPianificati,
    minuti_frequentati: round2(minutiFrequentati),
    ore_frequentate: round2(minutiFrequentati / 60),
    frequenza_percentuale: frequenza,
    presenze: eventi?.length ?? 0,
    durate_non_parsate: durateNonParsate,
    idoneo_frequenza: idoneo,
  };
}
