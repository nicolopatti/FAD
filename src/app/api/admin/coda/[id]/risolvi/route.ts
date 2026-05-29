import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';

// Risoluzione manuale di un match (ambiguo/assente): scrive
// presenza_webinar_registrata + match_risolto_manualmente via RPC (mai UPDATE).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  await requireAdmin();
  const body = (await request.json().catch(() => null)) as
    | { iscrizione_id?: string; motivazione?: string }
    | null;
  if (!body?.iscrizione_id) {
    return NextResponse.json({ ok: false, error: 'iscrizione_id mancante' }, { status: 400 });
  }
  const motivazione = body.motivazione?.trim();
  if (!motivazione) {
    return NextResponse.json({ ok: false, error: 'motivazione obbligatoria' }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('riconcilia_risolvi_match', {
    p_coda_id: params.id,
    p_iscrizione_id: body.iscrizione_id,
    p_motivazione: motivazione,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, result: data });
}
