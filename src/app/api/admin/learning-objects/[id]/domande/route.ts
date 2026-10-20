import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { validaDomande, type DomandaInput } from '@/lib/quiz';
import type { QuizDomandaRow } from '@/lib/db-types';

// Domande di un test. Lettura con il client RLS dell'admin (policy
// quiz_domanda_read_staff); scrittura via RPC `quiz_domande_salva`
// (sostituzione atomica + Evento, freeze D22 a livello DB).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('quiz_domanda')
    .select('id, learning_object_id, ordine, testo, tipo, risposte')
    .eq('learning_object_id', params.id)
    .order('ordine', { ascending: true })
    .returns<QuizDomandaRow[]>();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, domande: data ?? [] });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  await requireAdmin();
  const body = (await request.json().catch(() => null)) as { domande?: DomandaInput[] } | null;
  if (!body || !Array.isArray(body.domande)) {
    return NextResponse.json({ ok: false, error: 'domande mancanti' }, { status: 400 });
  }
  const domande: DomandaInput[] = body.domande.map((d) => ({
    testo: String(d?.testo ?? '').trim(),
    tipo: d?.tipo === 'scelta_multipla' ? 'scelta_multipla' : 'scelta_singola',
    risposte: Array.isArray(d?.risposte)
      ? d.risposte.map((r) => ({ testo: String(r?.testo ?? '').trim(), corretta: r?.corretta === true })).filter((r) => r.testo)
      : [],
  }));
  const errori = validaDomande(domande);
  if (errori.length) return NextResponse.json({ ok: false, error: errori.join(' ') , errori }, { status: 400 });

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('quiz_domande_salva', {
    p_learning_object_id: params.id,
    p_domande: domande,
  });
  if (error) {
    const msg = /congelato/i.test(error.message)
      ? 'Il test è usato in un corso congelato: le domande non si possono più modificare.'
      : error.message;
    return NextResponse.json({ ok: false, error: msg }, { status: /congelato/i.test(error.message) ? 409 : 400 });
  }
  return NextResponse.json({ ok: true, esito: data });
}
