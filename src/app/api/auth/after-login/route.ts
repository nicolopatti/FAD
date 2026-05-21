import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { appendEvent } from '@/lib/audit';

export async function POST() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: persona, error } = await supabase
    .from('persona')
    .select('id, tenant_id')
    .eq('auth_user_id', user.id)
    .single();
  if (error || !persona) {
    return NextResponse.json({ ok: false, error: 'persona non trovata' }, { status: 404 });
  }

  await appendEvent(supabase, {
    tenantId: persona.tenant_id,
    eventType: 'auth.login',
    actor: { persona_id: persona.id, type: 'persona' },
    subjectType: 'persona',
    subjectId: persona.id,
    payload: {},
  });

  return NextResponse.json({ ok: true });
}
