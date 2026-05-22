import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';

type UpdateBody = {
  titolo?: string;
};

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.titolo === 'string') {
    const t = body.titolo.trim();
    if (t === '') {
      return NextResponse.json({ ok: false, error: 'titolo non valido' }, { status: 400 });
    }
    updates.titolo = t;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: 'nessun campo da aggiornare' }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('learning_object')
    .update(updates)
    .eq('id', params.id)
    .select('id, type, titolo, config, archiviato_at, creato_il')
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  await appendEvent(supabase, {
    tenantId: session.tenantId,
    eventType: 'learning_object.updated',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'learning_object',
    subjectId: data.id,
    payload: { titolo: data.titolo },
  });

  return NextResponse.json({ ok: true, learning_object: data });
}
