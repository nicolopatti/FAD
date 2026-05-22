import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';

type UpdateBody = {
  obbligatorio?: boolean;
};

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; strutturaId: string } },
) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof body.obbligatorio === 'boolean') {
    updates.obbligatorio = body.obbligatorio;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: 'nessun campo da aggiornare' }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('struttura_corso')
    .update(updates)
    .eq('id', params.strutturaId)
    .eq('corso_id', params.id)
    .select('id, ordine, obbligatorio, regola_completamento, learning_object_id')
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await appendEvent(supabase, {
    tenantId: session.tenantId,
    eventType: 'struttura.updated',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'corso',
    subjectId: params.id,
    payload: {
      struttura_id: data.id,
      obbligatorio: data.obbligatorio,
    },
  });

  return NextResponse.json({ ok: true, struttura: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; strutturaId: string } },
) {
  const session = await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('struttura_corso')
    .delete()
    .eq('id', params.strutturaId)
    .eq('corso_id', params.id)
    .select('id, learning_object_id, ordine')
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await appendEvent(supabase, {
    tenantId: session.tenantId,
    eventType: 'struttura.removed',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'corso',
    subjectId: params.id,
    payload: {
      struttura_id: data.id,
      learning_object_id: data.learning_object_id,
      ordine: data.ordine,
    },
  });

  return NextResponse.json({ ok: true });
}
