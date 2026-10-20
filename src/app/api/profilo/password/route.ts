import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { appendEvent } from '@/lib/audit';

// Cambio password dell'utente autenticato (dal profilo o dopo un link via
// email). L'aggiornamento è su Supabase Auth con la sessione dell'utente; poi
// un Evento `auth.password_aggiornata` senza alcun dato sensibile.
export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Sessione scaduta: riapri il link o accedi di nuovo.' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === 'string' ? body.password : '';
  if (password.length < 10) return NextResponse.json({ ok: false, error: 'La password deve avere almeno 10 caratteri.' }, { status: 400 });

  const { data: persona } = await supabase.from('persona').select('id, tenant_id').eq('auth_user_id', user.id).maybeSingle<{ id: string; tenant_id: string }>();
  if (!persona) return NextResponse.json({ ok: false, error: 'Utente non collegato a una persona: contatta il referente.' }, { status: 403 });

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const m = error.message.toLowerCase();
    const testo = m.includes('different from the old') || m.includes('same password') ? 'La nuova password deve essere diversa da quella attuale.'
      : m.includes('weak') || m.includes('pwned') || m.includes('leaked') ? 'Questa password è troppo debole o compare in elenchi di password compromesse: scegline un’altra.'
        : `Password non aggiornata: ${error.message}`;
    return NextResponse.json({ ok: false, error: testo }, { status: 400 });
  }

  await appendEvent({
    tenantId: persona.tenant_id,
    eventType: 'auth.password_aggiornata',
    actor: { persona_id: persona.id, type: 'persona' },
    subjectType: 'persona',
    subjectId: persona.id,
    payload: {},
  });
  return NextResponse.json({ ok: true });
}
