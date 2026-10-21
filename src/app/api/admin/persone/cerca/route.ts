import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';

const LIMITE = 30;
type Riga = { id: string; nome: string; cognome: string; email: string; codice_fiscale: string | null; accesso: boolean; n_iscrizioni: number };

/**
 * Ricerca di persone sul server per i selettori (docenti, iscritti): cognome,
 * nome, email o codice fiscale, max 30 risultati + `troncato`. Sola lettura.
 */
export async function GET(request: Request) {
  await requireAdmin();
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('persona_riepilogo')
    .select('id, nome, cognome, email, codice_fiscale, accesso, n_iscrizioni')
    .order('cognome').order('nome')
    .limit(LIMITE + 1);
  if (q) {
    const like = `%${q.replace(/[%_,]/g, ' ')}%`;
    query = query.or(`cognome.ilike.${like},nome.ilike.${like},email.ilike.${like},codice_fiscale.ilike.${like}`);
  }
  const { data, error } = await query.returns<Riga[]>();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  const righe = data ?? [];
  return NextResponse.json({ ok: true, persone: righe.slice(0, LIMITE), troncato: righe.length > LIMITE });
}
