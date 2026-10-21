import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';

const LIMITE = 30;
type Riga = { id: string; ragione_sociale: string; partita_iva: string | null; sede_comune: string | null; n_iscrizioni: number };

/** Ricerca di aziende sul server (ragione sociale o partita IVA), max 30 + `troncato`. Sola lettura. */
export async function GET(request: Request) {
  await requireAdmin();
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  const escludi = url.searchParams.get('escludi') ?? '';
  const supabase = await createSupabaseServerClient();

  let query = supabase.from('azienda_riepilogo').select('id, ragione_sociale, partita_iva, sede_comune, n_iscrizioni').order('ragione_sociale').limit(LIMITE + 1);
  if (q) {
    const like = `%${q.replace(/[%_,]/g, ' ')}%`;
    query = query.or(`ragione_sociale.ilike.${like},partita_iva.ilike.${like}`);
  }
  if (escludi) query = query.neq('id', escludi);
  const { data, error } = await query.returns<Riga[]>();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  const righe = data ?? [];
  return NextResponse.json({ ok: true, aziende: righe.slice(0, LIMITE), troncato: righe.length > LIMITE });
}
