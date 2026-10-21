import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';

type Body = { piano_id?: string | null };

/**
 * Assegna un piano finanziato a tutti gli iscritti dell'edizione (null = toglie
 * il piano a tutti). Le eccezioni per singolo iscritto si fanno dalla scheda
 * Iscritti. Un solo Evento per l'operazione, senza PII.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || body.piano_id === undefined) return NextResponse.json({ ok: false, error: 'piano_id mancante (null per togliere)' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: edizione } = await supabase.from('edizione').select('id').eq('id', params.id).maybeSingle();
  if (!edizione) return NextResponse.json({ ok: false, error: 'edizione non trovata' }, { status: 404 });

  const pianoId = body.piano_id ? String(body.piano_id) : null;
  if (pianoId) {
    const { data: piano } = await supabase.from('piano_formativo_finanziato').select('id').eq('id', pianoId).maybeSingle();
    if (!piano) return NextResponse.json({ ok: false, error: 'piano non trovato' }, { status: 404 });
  }

  const { data, error } = await supabase.from('iscrizione').update({ piano_id: pianoId }).eq('edizione_id', edizione.id).select('id');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  const n = data?.length ?? 0;

  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'edizione.piano_assegnato',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'edizione',
    subjectId: edizione.id,
    payload: { piano_id: pianoId, n_iscrizioni: n },
  });

  return NextResponse.json({ ok: true, aggiornate: n });
}
