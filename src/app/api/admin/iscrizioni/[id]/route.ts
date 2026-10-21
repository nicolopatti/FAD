import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';

type UpdateBody = {
  piano_id?: string | null;
};

// Assegnazione (o rimozione) del Piano finanziato a un'iscrizione. Il Piano
// deve esistere nel tenant (RLS `piano_read`). Evento senza PII: solo UUID.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  if (!body || body.piano_id === undefined) {
    return NextResponse.json({ ok: false, error: 'piano_id mancante' }, { status: 400 });
  }
  const supabase = await createSupabaseServerClient();

  const pianoId = typeof body.piano_id === 'string' && body.piano_id ? body.piano_id : null;
  if (pianoId) {
    const { data: piano } = await supabase.from('piano_formativo_finanziato').select('id').eq('id', pianoId).maybeSingle();
    if (!piano) return NextResponse.json({ ok: false, error: 'piano non trovato' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('iscrizione')
    .update({ piano_id: pianoId })
    .eq('id', params.id)
    .select('id, edizione_id, piano_id')
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ ok: false, error: 'iscrizione non trovata' }, { status: 404 });

  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'iscrizione.updated',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'iscrizione',
    subjectId: data.id,
    payload: { edizione_id: data.edizione_id, piano_id: data.piano_id },
  });

  return NextResponse.json({ ok: true, iscrizione: data });
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await requireAdmin();
  const supabase = await createSupabaseServerClient();

  // Recupera l'iscrizione (per il payload dell'Evento, senza PII).
  const { data: isc } = await supabase
    .from('iscrizione')
    .select('id, edizione_id, persona_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!isc) return NextResponse.json({ ok: false, error: 'iscrizione non trovata' }, { status: 404 });

  const { error } = await supabase.from('iscrizione').delete().eq('id', params.id);
  if (error) {
    const msg = error.code === '23503' ? 'L’iscrizione ha un attestato o altri dati collegati e non si rimuove: resta nel registro.' : error.message;
    return NextResponse.json({ ok: false, error: msg }, { status: error.code === '23503' ? 409 : 400 });
  }

  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'iscrizione.removed',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'iscrizione',
    subjectId: params.id,
    payload: { edizione_id: isc.edizione_id, persona_id: isc.persona_id },
  });

  return NextResponse.json({ ok: true });
}
