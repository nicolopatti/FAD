import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  const supabase = createSupabaseServerClient();

  // Recupera l'iscrizione (per il payload dell'Evento, senza PII).
  const { data: isc } = await supabase
    .from('iscrizione')
    .select('id, edizione_id, persona_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!isc) return NextResponse.json({ ok: false, error: 'iscrizione non trovata' }, { status: 404 });

  const { error } = await supabase.from('iscrizione').delete().eq('id', params.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await appendEvent(supabase, {
    tenantId: session.tenantId,
    eventType: 'iscrizione.removed',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'iscrizione',
    subjectId: params.id,
    payload: { edizione_id: isc.edizione_id, persona_id: isc.persona_id },
  });

  return NextResponse.json({ ok: true });
}
