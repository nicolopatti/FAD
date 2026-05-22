import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';

// D15/D22: soft-archive, mai DELETE fisico. Le righe restano referenziabili
// dalle Strutture già create; le nuove non possono più usarle (lo enforcement
// arriva con il Task 2). Qui solo l'archive flag.

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const session = await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('learning_object')
    .update({ archiviato_at: new Date().toISOString() })
    .eq('id', params.id)
    .is('archiviato_at', null)
    .select('id, titolo')
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  await appendEvent(supabase, {
    tenantId: session.tenantId,
    eventType: 'learning_object.archived',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'learning_object',
    subjectId: data.id,
    payload: { titolo: data.titolo },
  });

  return NextResponse.json({ ok: true });
}
