import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { emettiPerSessioneSeIdonee } from '@/lib/attestati';

// Inserimento manuale di una presenza mancante (Task 5). Evento, non UPDATE.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as
    | { iscrizione_id?: string; durata?: string; motivazione?: string }
    | null;
  if (!body?.iscrizione_id) {
    return NextResponse.json({ ok: false, error: 'iscrizione_id mancante' }, { status: 400 });
  }
  const durata = (body.durata ?? '').trim();
  if (!durata) return NextResponse.json({ ok: false, error: 'durata mancante' }, { status: 400 });
  const motivazione = body.motivazione?.trim();
  if (!motivazione) return NextResponse.json({ ok: false, error: 'motivazione obbligatoria' }, { status: 400 });

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('presenza_inserisci_manuale', {
    p_sessione_id: params.id,
    p_iscrizione_id: body.iscrizione_id,
    p_durata: durata,
    p_motivazione: motivazione,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  // Fase 5: la presenza può chiudere il percorso di un corso webinar → attestato automatico.
  const attestati = await emettiPerSessioneSeIdonee(params.id, session.personaId).catch(() => []);
  return NextResponse.json({ ok: true, result: data, attestati_emessi: attestati.length });
}
