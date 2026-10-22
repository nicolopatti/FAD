import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { appendEvent } from '@/lib/audit';
import { assicuraPersona } from '@/lib/registrazione';

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  let { data: persona } = await supabase
    .from('persona')
    .select('id, tenant_id')
    .eq('auth_user_id', user.id)
    .maybeSingle<{ id: string; tenant_id: string }>();
  if (!persona) {
    // Fase 6: account creato dalla registrazione autonoma, Persona non ancora collegata.
    const esito = await assicuraPersona(user);
    if (!esito.ok) return NextResponse.json({ ok: false, error: esito.errore }, { status: 404 });
    persona = { id: esito.persona_id, tenant_id: esito.tenant_id };
  }

  await appendEvent({
    tenantId: persona.tenant_id,
    eventType: 'auth.login',
    actor: { persona_id: persona.id, type: 'persona' },
    subjectType: 'persona',
    subjectId: persona.id,
    payload: {},
  });

  return NextResponse.json({ ok: true });
}
