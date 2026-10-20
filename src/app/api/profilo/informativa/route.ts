import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { appendEvent } from '@/lib/audit';

// Prima accettazione dell'informativa sul trattamento dei dati: un Evento nel
// registro (`informativa.accettata`, con la versione del testo), mai una
// colonna. Idempotente: una seconda accettazione è un Evento in più, innocuo.
export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { versione?: unknown } | null;
  const versione = Number.isInteger(body?.versione) ? Number(body!.versione) : 1;
  const { data: persona } = await supabase.from('persona').select('id, tenant_id').eq('auth_user_id', user.id).maybeSingle<{ id: string; tenant_id: string }>();
  if (!persona) return NextResponse.json({ ok: false }, { status: 403 });
  await appendEvent({
    tenantId: persona.tenant_id,
    eventType: 'informativa.accettata',
    actor: { persona_id: persona.id, type: 'persona' },
    subjectType: 'persona',
    subjectId: persona.id,
    payload: { versione },
  });
  return NextResponse.json({ ok: true });
}
