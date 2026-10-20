import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { emettiAttestatoSeIdonea } from '@/lib/attestati';

// Correzione manuale di una presenza esistente (Task 5, M3a #7): nuovo Evento
// presenza_corretta_manualmente che referenzia [id] (mai UPDATE). [id] = Evento
// di presenza precedente.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
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
  // Fase 5: la durata corretta può portare la frequenza sopra soglia → attestato automatico.
  const { data: prev } = await supabase.from('evento').select('payload').eq('id', params.id).maybeSingle<{ payload: { iscrizione_id?: string } | null }>();
  const iscrId = prev?.payload?.iscrizione_id;
  const attestato = iscrId ? await emettiAttestatoSeIdonea(iscrId, session.personaId).catch(() => null) : null;
  return NextResponse.json({ ok: true, result: data, attestato: attestato ? { numero: attestato.numero } : null });
}
