import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { unwrap } from '@/lib/db-result';
import type { LearningObjectType } from '@/lib/db-types';

export type ContenutoTrovato = {
  id: string;
  type: LearningObjectType;
  titolo: string;
  config: Record<string, unknown>;
  /** Numero di corsi in cui è una lezione. */
  usato_in: number;
};

const LIMITE = 30;

async function conUtilizzo(supabase: ReturnType<typeof createSupabaseServerClient>, righe: Omit<ContenutoTrovato, 'usato_in'>[]): Promise<ContenutoTrovato[]> {
  if (righe.length === 0) return [];
  const usi = unwrap(await supabase.from('struttura_corso').select('learning_object_id').in('learning_object_id', righe.map((r) => r.id)), 'l’utilizzo dei contenuti');
  const n = new Map<string, number>();
  for (const u of usi) n.set(u.learning_object_id as string, (n.get(u.learning_object_id as string) ?? 0) + 1);
  return righe.map((r) => ({ ...r, usato_in: n.get(r.id) ?? 0 }));
}

/**
 * Ricerca nella libreria dei contenuti, sul server (pannello "Dalla libreria" del
 * corso). `q` sul titolo, `tipo`, `escludi_corso` toglie i contenuti già nel corso.
 */
export async function GET(request: Request) {
  await requireAdmin();
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const tipo = url.searchParams.get('tipo');
  const escludi = url.searchParams.get('escludi_corso');
  const supabase = createSupabaseServerClient();

  let query = supabase
    .from('learning_object')
    .select('id, type, titolo, config')
    .is('archiviato_at', null)
    .order('titolo', { ascending: true })
    .limit(LIMITE + 100);
  if (q) query = query.ilike('titolo', `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`);
  if (tipo === 'video' || tipo === 'documento' || tipo === 'quiz') query = query.eq('type', tipo);

  let righe = unwrap(await query.returns<Omit<ContenutoTrovato, 'usato_in'>[]>(), 'la libreria');
  if (escludi) {
    const inCorso = unwrap(await supabase.from('struttura_corso').select('learning_object_id').eq('corso_id', escludi), 'le lezioni del corso');
    const usati = new Set(inCorso.map((r) => r.learning_object_id as string));
    righe = righe.filter((r) => !usati.has(r.id));
  }
  const troncato = righe.length > LIMITE;
  const risultati = await conUtilizzo(supabase, righe.slice(0, LIMITE));
  return NextResponse.json({ ok: true, risultati, troncato });
}

/**
 * Classificazione di un elenco di titoli (anteprima dell'import CSV): per ogni
 * titolo dice se esiste già un contenuto attivo con quel titolo.
 */
export async function POST(request: Request) {
  await requireAdmin();
  const body = (await request.json().catch(() => null)) as { titoli?: unknown } | null;
  const titoli = Array.isArray(body?.titoli) ? body!.titoli.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean).slice(0, 500) : [];
  if (titoli.length === 0) return NextResponse.json({ ok: true, trovati: {} });
  const supabase = createSupabaseServerClient();
  const righe = unwrap(await supabase.from('learning_object').select('id, type, titolo').is('archiviato_at', null).in('titolo', titoli), 'la libreria');
  const trovati: Record<string, { id: string; type: LearningObjectType }> = {};
  for (const r of righe) trovati[(r.titolo as string).toLowerCase().trim()] = { id: r.id as string, type: r.type as LearningObjectType };
  return NextResponse.json({ ok: true, trovati });
}
