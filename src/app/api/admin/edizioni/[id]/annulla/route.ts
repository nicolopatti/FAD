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
    .from('edizione')
    .update({ annullato_at: new Date().toISOString() })
    .eq('id', params.id)
    .is('annullato_at', null)
    .select('id, corso_id, codice')
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await appendEvent(supabase, {
    tenantId: session.tenantId,
    eventType: 'edizione.cancelled',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'edizione',
    subjectId: data.id,
    payload: { corso_id: data.corso_id, codice: data.codice },
  });

  return NextResponse.json({ ok: true });
}
