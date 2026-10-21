import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('edizione')
    .update({ annullato_at: new Date().toISOString() })
    .eq('id', params.id)
    .is('annullato_at', null)
    .is('concluso_at', null)
    .select('id, corso_id, codice')
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ ok: false, error: 'Edizione non trovata, già conclusa o annullata.' }, { status: 409 });

  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'edizione.cancelled',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'edizione',
    subjectId: data.id,
    payload: { corso_id: data.corso_id, codice: data.codice },
  });

  return NextResponse.json({ ok: true });
}
