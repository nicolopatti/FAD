import type { SupabaseClient } from '@supabase/supabase-js';
import type { LearningObjectType, QuizRisposta, QuizTipoDomanda } from './db-types';
import { validaDomande } from './quiz';

/**
 * Prontezza del corso alla prima edizione (stress test 21/10, A3). La prima
 * edizione congela sequenza, regole e le DOMANDE dei test (D22, trigger
 * tg_quiz_domanda_freeze): un test obbligatorio senza domande valide non si
 * potrebbe più completare → è un blocco. Video senza ID o durata e PDF senza
 * file sono avvisi: il contenuto di una lezione video/PDF resta sostituibile.
 */
export type ItemProntezza = {
  ordine: number;
  obbligatorio: boolean;
  titolo: string;
  tipo: LearningObjectType;
  config: Record<string, unknown>;
  learning_object_id: string;
};

export type DomandaProntezza = { testo: string; tipo: QuizTipoDomanda; risposte: QuizRisposta[] };

export type ProntezzaCorso = {
  bloccanti: string[];
  avvisi: string[];
  /** Domande valide per test (learning_object_id → numero). */
  domandePerTest: Record<string, number>;
};

function domandeValide(domande: DomandaProntezza[]): number {
  return domande.filter((d) => validaDomande([d]).length === 0).length;
}

export function valutaProntezza(items: ItemProntezza[], domandeByLo: Map<string, DomandaProntezza[]>): ProntezzaCorso {
  const bloccanti: string[] = [];
  const avvisi: string[] = [];
  const domandePerTest: Record<string, number> = {};
  for (const it of items) {
    const nome = `"${it.titolo}" (lezione ${it.ordine})`;
    if (it.tipo === 'quiz') {
      const n = domandeValide(domandeByLo.get(it.learning_object_id) ?? []);
      domandePerTest[it.learning_object_id] = n;
      if (n === 0) {
        const msg = `Il test ${nome} non ha domande valide (testo, almeno due risposte e almeno una giusta).`;
        if (it.obbligatorio) bloccanti.push(`${msg} Scrivile prima della prima edizione: dopo non si possono più modificare.`);
        else avvisi.push(`${msg} È facoltativo, ma dopo la prima edizione resterà vuoto.`);
      }
    } else if (it.tipo === 'video') {
      const id = String(it.config?.vimeo_id ?? '').trim();
      const durata = Number(it.config?.durata_secondi);
      if (!id) avvisi.push(`Il video ${nome} non ha l'ID Vimeo.`);
      if (!Number.isFinite(durata) || durata <= 0) avvisi.push(`Il video ${nome} non ha la durata.`);
    } else if (it.tipo === 'documento') {
      if (!String(it.config?.storage_key ?? '').trim()) avvisi.push(`Il PDF ${nome} non ha il file.`);
    }
  }
  return { bloccanti, avvisi, domandePerTest };
}

type StrutturaRiga = {
  ordine: number;
  obbligatorio: boolean;
  learning_object_id: string;
  learning_object: { titolo: string; type: LearningObjectType; config: Record<string, unknown> } | null;
};

export async function prontezzaCorso(supabase: SupabaseClient, corsoId: string): Promise<ProntezzaCorso> {
  const { data: righe, error } = await supabase
    .from('struttura_corso')
    .select('ordine, obbligatorio, learning_object_id, learning_object:learning_object_id ( titolo, type, config )')
    .eq('corso_id', corsoId)
    .order('ordine', { ascending: true })
    .returns<StrutturaRiga[]>();
  if (error) throw new Error(`Lettura delle lezioni non riuscita: ${error.message}`);
  const items: ItemProntezza[] = (righe ?? []).filter((r) => r.learning_object).map((r) => ({
    ordine: r.ordine,
    obbligatorio: r.obbligatorio,
    learning_object_id: r.learning_object_id,
    titolo: r.learning_object!.titolo,
    tipo: r.learning_object!.type,
    config: r.learning_object!.config ?? {},
  }));
  const quizIds = items.filter((i) => i.tipo === 'quiz').map((i) => i.learning_object_id);
  const domandeByLo = new Map<string, DomandaProntezza[]>();
  if (quizIds.length) {
    const { data: domande, error: errD } = await supabase
      .from('quiz_domanda')
      .select('learning_object_id, testo, tipo, risposte')
      .in('learning_object_id', quizIds)
      .returns<(DomandaProntezza & { learning_object_id: string })[]>();
    if (errD) throw new Error(`Lettura delle domande non riuscita: ${errD.message}`);
    for (const d of domande ?? []) {
      if (!domandeByLo.has(d.learning_object_id)) domandeByLo.set(d.learning_object_id, []);
      domandeByLo.get(d.learning_object_id)!.push(d);
    }
  }
  return valutaProntezza(items, domandeByLo);
}
