import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const session = await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('learning_object')
    .update({ archiviato_at: null })
    .eq('id', params.id)
    .not('archiviato_at', 'is', null)
    .select('id, titolo')
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  await appendEvent(supabase, {
    tenantId: session.tenantId,
    eventType: 'learning_object.unarchived',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'learning_object',
    subjectId: data.id,
    payload: { titolo: data.titolo },
  });

  return NextResponse.json({ ok: true });
}
