import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { appendEvent } from '@/lib/audit';

export async function POST() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: persona } = await supabase
      .from('persona')
      .select('id, tenant_id')
      .eq('auth_user_id', user.id)
      .single();
    if (persona) {
      await appendEvent(supabase, {
        tenantId: persona.tenant_id,
        eventType: 'auth.logout',
        actor: { persona_id: persona.id, type: 'persona' },
        subjectType: 'persona',
        subjectId: persona.id,
        payload: {},
      });
    }
  }

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
