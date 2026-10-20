import type { SupabaseClient } from '@supabase/supabase-js';
import type { LearningObjectType, StrutturaRow } from './db-types';
import { coperturaPercentuale, ricostruisciTrattiDaEventi, visioneIntegraleCompleta, type EventoVideo, type Segmento } from './visione';

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
  /** Timestamp server dell'evento di completamento (ISO), se completato. */
  completato_il?: string;
  sbloccato: boolean;
  /** Solo video: % della durata effettivamente riprodotta (unione dei tratti visti), se tracciata. */
  copertura_percentuale?: number;
  /** Solo video: tratti riprodotti [inizio, fine] in secondi, uniti, ricostruiti dal log. */
  segmenti_visti?: Segmento[];
  /** Solo test: tentativi e percentuali dagli Eventi `quiz.submitted`. */
  quiz?: EsitoQuiz;
};

export type ProgressoIscrizione = {
  iscrizione_id: string;
  edizione_id: string;
  persona_id: string;
  corso_id: string;
  corso_titolo: string;
  sblocco_sequenziale: boolean;
  visione_integrale: boolean;
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
  // Il test (Fase 5): l'Evento `quiz.submitted` conta come completamento solo se
  // `payload.superato` è true (correzione fatta dal server, D26).
  quiz_passed: 'quiz.submitted',
};

// Etichetta leggibile della regola di completamento per la UI di audit (D35).
// Stesso vocabolario di COMPLETION_EVENT_FOR_RULE: "visione/lettura integrale".
export function regolaLabel(tipo: string): string {
  switch (tipo) {
    case 'video_ended':
      return 'visione integrale';
    case 'documento_completed':
      return 'lettura integrale';
    case 'quiz_passed':
      return 'test superato';
    default:
      return tipo;
  }
}

/** Esito del test finale ricavato dagli Eventi `quiz.submitted` del discente. */
export type EsitoQuiz = {
  tentativi: number;
  superato: boolean;
  /** percentuale dell'ultimo tentativo */
  ultima_percentuale: number | null;
  /** miglior percentuale tra i tentativi */
  migliore_percentuale: number | null;
  /** istante del primo tentativo superato */
  superato_il: string | null;
};

type IscrEdCorso = {
  id: string;
  persona_id: string;
  edizione_id: string;
  edizione: { id: string; corso_id: string; corso: { id: string; titolo: string; sblocco_sequenziale: boolean; visione_integrale: boolean } | null } | null;
};

type EventoCompletamento = {
  subject_id: string | null;
  event_type: string;
  occurred_at: string;
  actor: { persona_id?: string } | null;
  payload: Record<string, unknown> | null;
};

const SELECT_ISCRIZIONE = 'id, persona_id, edizione_id, edizione:edizione_id ( id, corso_id, corso:corso_id ( id, titolo, sblocco_sequenziale, visione_integrale ) )';
const SELECT_STRUTTURA = `
      id, corso_id, ordine, obbligatorio, regola_completamento, learning_object_id,
      learning_object:learning_object_id ( titolo, type, config )
    `;

function itemsDaStruttura(rows: (StrutturaRow & { corso_id?: string })[]): StrutturaItem[] {
  return rows
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
}

/** Tipi di Evento da leggere per una struttura (completamento + copertura video). */
function tipiEventoPer(items: StrutturaItem[]): string[] {
  const completionTypes = Array.from(new Set(items.map((i) => COMPLETION_EVENT_FOR_RULE[i.regola_completamento.tipo]))).filter(Boolean);
  const coverageTypes = items.some((i) => i.lo_type === 'video') ? ['video.play', 'video.pause', 'video.seek', 'video.ended', 'video.progress'] : [];
  return Array.from(new Set([...completionTypes, ...coverageTypes]));
}

/**
 * Nucleo puro del ricalcolo (D8): dati già caricati → progresso. Gli Eventi
 * devono essere SOLO quelli di questa iscrizione (attore = persona,
 * payload.iscrizione_id = iscrizione), in ordine di `seq`.
 */
export function calcolaProgresso(
  iscrizione: { id: string; persona_id: string; edizione_id: string },
  corso: { id: string; titolo: string; sblocco_sequenziale: boolean; visione_integrale: boolean },
  items: StrutturaItem[],
  events: EventoCompletamento[],
): ProgressoIscrizione {
  const loIds = new Set(items.map((i) => i.learning_object_id));
  // Visione integrale (corso.visione_integrale): oltre a `video.ended` serve la
  // copertura dei tratti riprodotti. La copertura si RICOSTRUISCE dai timestamp
  // server degli eventi play/pause/seek/ended (tempo reale, lib/visione.ts):
  // i `segmenti_visti` dichiarati dal client restano nel log solo a titolo
  // informativo (un player a 2x o una chiamata forgiata non contano).
  const integrale = Boolean(corso.visione_integrale);
  const completionEventsByLo = new Map<string, Set<string>>();
  const completionAtByLo = new Map<string, string>();
  const videoEventsByLo = new Map<string, EventoVideo[]>();
  const durataByLo = new Map<string, number>();
  const quizByLo = new Map<string, EsitoQuiz>();
  for (const e of events) {
    // Controllo difensivo: il filtro SQL è già sull'attore e sull'iscrizione.
    if (e.actor?.persona_id !== iscrizione.persona_id || !e.subject_id || !loIds.has(e.subject_id)) continue;
    if (e.event_type === 'quiz.submitted') {
      // Il test conta solo se superato (correzione del server nel payload).
      const perc = typeof e.payload?.percentuale === 'number' ? (e.payload.percentuale as number) : null;
      const superato = e.payload?.superato === true;
      const q = quizByLo.get(e.subject_id) ?? { tentativi: 0, superato: false, ultima_percentuale: null, migliore_percentuale: null, superato_il: null };
      q.tentativi += 1;
      q.ultima_percentuale = perc;
      if (perc != null && (q.migliore_percentuale == null || perc > q.migliore_percentuale)) q.migliore_percentuale = perc;
      if (superato && !q.superato) { q.superato = true; q.superato_il = e.occurred_at; }
      quizByLo.set(e.subject_id, q);
      if (!superato) continue;
    }
    if (!completionEventsByLo.has(e.subject_id)) completionEventsByLo.set(e.subject_id, new Set());
    completionEventsByLo.get(e.subject_id)!.add(e.event_type);
    if (!e.event_type.startsWith('video.') || e.event_type === 'video.ended') {
      // primo evento di completamento: resta quello (append-only, ordine per seq)
      if (!completionAtByLo.has(e.subject_id)) completionAtByLo.set(e.subject_id, e.occurred_at);
    }
    if (e.event_type.startsWith('video.')) {
      const acc = videoEventsByLo.get(e.subject_id) ?? [];
      acc.push({ event_type: e.event_type, occurred_at: e.occurred_at, payload: e.payload });
      videoEventsByLo.set(e.subject_id, acc);
    }
    const d = e.payload?.durata_secondi;
    if (typeof d === 'number' && Number.isFinite(d) && d > 0) {
      durataByLo.set(e.subject_id, Math.max(durataByLo.get(e.subject_id) ?? 0, d));
    }
  }

  // Calcolo sblocco sequenziale: un LO è sbloccato se tutti i precedenti
  // *obbligatori* sono completati (oppure il corso non ha sblocco sequenziale).
  let allMandatoryPreviousComplete = true;
  const decorated: ProgressoLO[] = items.map((it) => {
    const ruleEvent = COMPLETION_EVENT_FOR_RULE[it.regola_completamento.tipo];
    const seen = completionEventsByLo.get(it.learning_object_id);
    const haRuleEvent = Boolean(ruleEvent && seen?.has(ruleEvent));
    let completato = haRuleEvent;
    let copertura: number | undefined;
    let segmentiVideo: Segmento[] | undefined;
    if (it.lo_type === 'video') {
      // Durata: quella riportata dal player (reale) se c'è, altrimenti quella dichiarata dall'admin.
      const cfgDurata = Number((it.lo_config as { durata_secondi?: unknown }).durata_secondi);
      const durata = durataByLo.get(it.learning_object_id) ?? (Number.isFinite(cfgDurata) ? cfgDurata : 0);
      const segmenti = ricostruisciTrattiDaEventi(videoEventsByLo.get(it.learning_object_id) ?? [], durata);
      segmentiVideo = segmenti;
      if (segmenti.length || durata > 0) copertura = coperturaPercentuale(segmenti, durata);
      if (integrale && it.regola_completamento.tipo === 'video_ended') {
        completato = visioneIntegraleCompleta(segmenti, durata, haRuleEvent);
      }
    }
    const sbloccato = corso.sblocco_sequenziale ? allMandatoryPreviousComplete : true;
    if (it.obbligatorio && !completato) allMandatoryPreviousComplete = false;
    const out: ProgressoLO = { ...it, completato, sbloccato };
    if (completato) out.completato_il = completionAtByLo.get(it.learning_object_id);
    if (copertura !== undefined) out.copertura_percentuale = copertura;
    if (segmentiVideo) out.segmenti_visti = segmentiVideo;
    if (it.lo_type === 'quiz') out.quiz = quizByLo.get(it.learning_object_id) ?? { tentativi: 0, superato: false, ultima_percentuale: null, migliore_percentuale: null, superato_il: null };
    return out;
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
    visione_integrale: integrale,
    totale,
    completati,
    obbligatori_completati: obbligatoriCompletati,
    obbligatori_totale: obbligatoriTot,
    idonea,
    items: decorated,
  };
}

export async function computeProgressoForIscrizione(
  supabase: SupabaseClient,
  iscrizioneId: string,
): Promise<ProgressoIscrizione | null> {
  // Iscrizione → Edizione → Corso in UNA query (prima erano 3 round trip).
  const { data: iscrizione, error: errIscr } = await supabase
    .from('iscrizione')
    .select(SELECT_ISCRIZIONE)
    .eq('id', iscrizioneId)
    .returns<IscrEdCorso[]>()
    .maybeSingle();
  if (errIscr || !iscrizione) return null;
  const corso = iscrizione.edizione?.corso ?? null;
  if (!corso) return null;

  const { data: struttura, error: errStr } = await supabase
    .from('struttura_corso')
    .select(SELECT_STRUTTURA)
    .eq('corso_id', corso.id)
    .order('ordine', { ascending: true })
    .returns<StrutturaRow[]>();
  if (errStr || !struttura) return null;
  const items = itemsDaStruttura(struttura);
  const loIds = items.map((i) => i.learning_object_id);

  // Eventi di completamento di QUESTA iscrizione sugli LO di questo corso.
  // Il filtro sull'attore è in SQL (indice evento_actor_persona_idx, migration
  // 20261019000004): prima si leggevano gli eventi di tutti i discenti del corso
  // e si filtrava in JavaScript — costo proporzionale agli iscritti a ogni
  // richiesta del player. Il filtro sull'iscrizione (payload.iscrizione_id, indice
  // evento_payload_iscrizione_idx) evita che un contenuto della libreria riusato
  // in due corsi porti il credito da un corso all'altro: ogni iscrizione ha la
  // propria evidenza (tutti gli eventi del player lo portano dalla Fase 1).
  const eventTypes = tipiEventoPer(items);
  let events: EventoCompletamento[] = [];
  if (loIds.length && eventTypes.length) {
    events = await tutteLeRighe<EventoCompletamento>((da, a) => supabase
      .from('evento')
      .select('subject_id, event_type, occurred_at, actor, payload')
      .eq('actor->>persona_id', iscrizione.persona_id)
      .eq('payload->>iscrizione_id', iscrizione.id)
      .in('event_type', eventTypes)
      .in('subject_id', loIds)
      .order('seq', { ascending: true })
      .range(da, a)
      .returns<EventoCompletamento[]>(), 'degli eventi');
  }
  return calcolaProgresso(iscrizione, corso, items, events);
}

// PostgREST risponde al massimo 1000 righe per richiesta (max-rows di Supabase)
// e le URL con troppi id nella `in()` vengono rifiutate: tutte le letture in
// blocco passano da qui, a pagine e a lotti. Un errore di lettura è un errore
// (mai "zero eventi" silenzioso: l'auditor vedrebbe tutti non idonei).
const PAGINA = 1000;
const LOTTO_IN = 200;
type Esito<T> = { data: T[] | null; error: { message: string } | null };

export function aLotti<T>(xs: T[], n = LOTTO_IN): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export async function tutteLeRighe<T>(pagina: (da: number, a: number) => PromiseLike<Esito<T>>, cosa: string): Promise<T[]> {
  const out: T[] = [];
  for (let da = 0; ; da += PAGINA) {
    const { data, error } = await pagina(da, da + PAGINA - 1);
    if (error) throw new Error(`Lettura ${cosa} non riuscita: ${error.message}`);
    const righe = data ?? [];
    out.push(...righe);
    if (righe.length < PAGINA) break;
  }
  return out;
}

/**
 * Versione in blocco (Blocco B #2): il progresso di MOLTE iscrizioni con un
 * numero fisso di query (iscrizioni, strutture, eventi) invece di 3 per
 * iscrizione. Stesso nucleo `calcolaProgresso`, stesso risultato. Usata dalle
 * viste dell'auditor e dal report fondo. Le iscrizioni non trovate mancano
 * dalla mappa.
 */
export async function computeProgressoPerIscrizioni(
  supabase: SupabaseClient,
  iscrizioneIds: string[],
): Promise<Map<string, ProgressoIscrizione>> {
  const out = new Map<string, ProgressoIscrizione>();
  const ids = Array.from(new Set(iscrizioneIds));
  if (!ids.length) return out;
  const iscrizioni: IscrEdCorso[] = [];
  for (const lotto of aLotti(ids)) {
    iscrizioni.push(...await tutteLeRighe<IscrEdCorso>((da, a) => supabase.from('iscrizione').select(SELECT_ISCRIZIONE).in('id', lotto).range(da, a).returns<IscrEdCorso[]>(), 'delle iscrizioni'));
  }
  const valide = iscrizioni.filter((i) => i.edizione?.corso);
  const corsoIds = Array.from(new Set(valide.map((i) => i.edizione!.corso!.id)));
  if (!corsoIds.length) return out;
  const struttura: (StrutturaRow & { corso_id: string })[] = [];
  for (const lotto of aLotti(corsoIds)) {
    struttura.push(...await tutteLeRighe<StrutturaRow & { corso_id: string }>((da, a) => supabase
      .from('struttura_corso')
      .select(SELECT_STRUTTURA)
      .in('corso_id', lotto)
      .order('ordine', { ascending: true })
      .range(da, a)
      .returns<(StrutturaRow & { corso_id: string })[]>(), 'delle strutture'));
  }
  const itemsPerCorso = new Map<string, StrutturaItem[]>();
  for (const c of corsoIds) itemsPerCorso.set(c, itemsDaStruttura(struttura.filter((s) => s.corso_id === c)));
  const eventTypes = Array.from(new Set(corsoIds.flatMap((c) => tipiEventoPer(itemsPerCorso.get(c) ?? []))));

  // Eventi di tutte le iscrizioni a lotti (indice evento_payload_iscrizione_idx) e a
  // pagine, poi distribuiti per iscrizione; il nucleo scarta quelli di LO non in struttura.
  const eventiPer = new Map<string, EventoCompletamento[]>();
  if (eventTypes.length) {
    for (const lotto of aLotti(valide.map((x) => x.id))) {
      const eventi = await tutteLeRighe<EventoCompletamento & { payload: { iscrizione_id?: string } | null }>((da, a) => supabase
        .from('evento')
        .select('subject_id, event_type, occurred_at, actor, payload')
        .in('payload->>iscrizione_id', lotto)
        .in('event_type', eventTypes)
        .order('seq', { ascending: true })
        .range(da, a)
        .returns<(EventoCompletamento & { payload: { iscrizione_id?: string } | null })[]>(), 'degli eventi');
      for (const e of eventi) {
        const k = e.payload?.iscrizione_id;
        if (!k) continue;
        if (!eventiPer.has(k)) eventiPer.set(k, []);
        eventiPer.get(k)!.push(e);
      }
    }
  }
  for (const i of valide) {
    const corso = i.edizione!.corso!;
    out.set(i.id, calcolaProgresso(i, corso, itemsPerCorso.get(corso.id) ?? [], eventiPer.get(i.id) ?? []));
  }
  return out;
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

type IscrEdSoglia = {
  id: string;
  edizione_id: string;
  edizione: { id: string; corso: { id: string; soglia_frequenza_percentuale: number | string | null } | null } | null;
};
type SessioneMini = { id: string; edizione_id: string; durata_minuti: number | null; annullato_at: string | null };
type PresEvt = {
  id: string;
  subject_id: string | null;
  payload: { durata?: string | null; corregge_evento_id?: string | null; iscrizione_id?: string | null } | null;
};
const TIPI_PRESENZA = ['presenza_webinar_registrata', 'presenza_inserita_manualmente', 'presenza_corretta_manualmente'];

/** Nucleo puro: frequenza di UNA iscrizione da sessioni dell'edizione ed Eventi di presenza (solo suoi, in ordine di seq). */
export function calcolaFrequenza(
  iscrizione: { id: string; edizione_id: string },
  soglia: number | null,
  sessioni: SessioneMini[],
  eventi: PresEvt[],
): FrequenzaIscrizione {
  // Sessioni (non annullate) dell'Edizione → minuti pianificati per sessione.
  const plannedBySessione = new Map<string, number>();
  let minutiPianificati = 0;
  for (const s of sessioni) {
    if (s.annullato_at) continue;
    const p = s.durata_minuti ?? 0;
    plannedBySessione.set(s.id, p);
    minutiPianificati += p;
  }

  // Correzioni manuali (D7/M3a#7): un Evento di correzione SUPERA quello
  // referenziato — la ricostruzione dello stato dal log esclude il superato.
  const superseded = new Set<string>();
  for (const e of eventi) {
    const ref = e.payload?.corregge_evento_id;
    if (ref) superseded.add(ref);
  }

  // Per ogni sessione, MAX durata tra gli Eventi EFFETTIVI (non superati),
  // limitata al pianificato (no doppio conteggio tra più report/rientri).
  const attendedBySessione = new Map<string, number>();
  let durateNonParsate = 0;
  for (const e of eventi) {
    if (!e.subject_id || superseded.has(e.id)) continue;
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
    presenze: eventi.length,
    durate_non_parsate: durateNonParsate,
    idoneo_frequenza: idoneo,
  };
}

/**
 * Frequenza di MOLTE iscrizioni con un numero fisso di query (iscrizioni,
 * sessioni delle loro edizioni, Eventi di presenza per iscrizione —
 * indice evento_payload_iscrizione_idx). Le iscrizioni non trovate mancano.
 */
export async function computeFrequenzaPerIscrizioni(
  supabase: SupabaseClient,
  iscrizioneIds: string[],
): Promise<Map<string, FrequenzaIscrizione>> {
  const out = new Map<string, FrequenzaIscrizione>();
  const ids = Array.from(new Set(iscrizioneIds));
  if (!ids.length) return out;
  const lista: IscrEdSoglia[] = [];
  for (const lotto of aLotti(ids)) {
    lista.push(...await tutteLeRighe<IscrEdSoglia>((da, a) => supabase
      .from('iscrizione')
      .select('id, edizione_id, edizione:edizione_id ( id, corso:corso_id ( id, soglia_frequenza_percentuale ) )')
      .in('id', lotto)
      .range(da, a)
      .returns<IscrEdSoglia[]>(), 'delle iscrizioni'));
  }
  if (!lista.length) return out;
  const edizioneIds = Array.from(new Set(lista.map((i) => i.edizione_id)));
  const sessioniPer = new Map<string, SessioneMini[]>();
  for (const lotto of aLotti(edizioneIds)) {
    const sessioni = await tutteLeRighe<SessioneMini>((da, a) => supabase
      .from('sessione')
      .select('id, edizione_id, durata_minuti, annullato_at')
      .in('edizione_id', lotto)
      .range(da, a)
      .returns<SessioneMini[]>(), 'delle sessioni');
    for (const s of sessioni) {
      if (!sessioniPer.has(s.edizione_id)) sessioniPer.set(s.edizione_id, []);
      sessioniPer.get(s.edizione_id)!.push(s);
    }
  }
  const eventiPer = new Map<string, PresEvt[]>();
  for (const lotto of aLotti(lista.map((x) => x.id))) {
    const eventi = await tutteLeRighe<PresEvt>((da, a) => supabase
      .from('evento')
      .select('id, subject_id, payload')
      .in('event_type', TIPI_PRESENZA)
      .in('payload->>iscrizione_id', lotto)
      .order('seq', { ascending: true })
      .range(da, a)
      .returns<PresEvt[]>(), 'delle presenze');
    for (const e of eventi) {
      const k = e.payload?.iscrizione_id;
      if (!k) continue;
      if (!eventiPer.has(k)) eventiPer.set(k, []);
      eventiPer.get(k)!.push(e);
    }
  }
  for (const i of lista) {
    const soglia = i.edizione?.corso?.soglia_frequenza_percentuale ?? null;
    out.set(i.id, calcolaFrequenza(i, soglia != null ? Number(soglia) : null, sessioniPer.get(i.edizione_id) ?? [], eventiPer.get(i.id) ?? []));
  }
  return out;
}

export async function computeFrequenzaForIscrizione(
  supabase: SupabaseClient,
  iscrizioneId: string,
): Promise<FrequenzaIscrizione | null> {
  const m = await computeFrequenzaPerIscrizioni(supabase, [iscrizioneId]);
  return m.get(iscrizioneId) ?? null;
}
