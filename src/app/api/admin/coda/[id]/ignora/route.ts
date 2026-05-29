import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';

// "Ignora definitivamente" una riga della coda: scrive
// partecipante_non_riconciliato via RPC (mai UPDATE). Motivazione obbligatoria.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  await requireAdmin();
  const body = (await request.json().catch(() => null)) as { motivazione?: string } | null;
  const motivazione = body?.motivazione?.trim();
  if (!motivazione) {
    return NextResponse.json({ ok: false, error: 'motivazione obbligatoria' }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('riconcilia_ignora', {
    p_coda_id: params.id,
    p_motivazione: motivazione,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, result: data });
}
