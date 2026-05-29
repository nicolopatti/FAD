import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';

// Correzione manuale di una presenza esistente (Task 5, M3a #7): nuovo Evento
// presenza_corretta_manualmente che referenzia [id] (mai UPDATE). [id] = Evento
// di presenza precedente.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  await requireAdmin();
  const body = (await request.json().catch(() => null)) as
    | { durata?: string; motivazione?: string }
    | null;
  const durata = (body?.durata ?? '').trim();
  if (!durata) return NextResponse.json({ ok: false, error: 'durata mancante' }, { status: 400 });
  const motivazione = body?.motivazione?.trim();
  if (!motivazione) return NextResponse.json({ ok: false, error: 'motivazione obbligatoria' }, { status: 400 });

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('presenza_correggi_manuale', {
    p_evento_precedente_id: params.id,
    p_durata: durata,
    p_motivazione: motivazione,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, result: data });
}
