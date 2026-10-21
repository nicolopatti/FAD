import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { invitaPersona, type PersonaDaInvitare } from '@/lib/inviti';

// Invito di una singola Persona del tenant (RLS: l'admin legge solo le proprie).
export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: persona } = await supabase
    .from('persona')
    .select('id, email, nome, auth_user_id')
    .eq('id', params.id)
    .maybeSingle<PersonaDaInvitare>();
  if (!persona) return NextResponse.json({ ok: false, error: 'persona non trovata' }, { status: 404 });
  if (persona.auth_user_id) return NextResponse.json({ ok: false, error: 'La persona ha già un accesso.' }, { status: 409 });
  try {
    const esito = await invitaPersona(supabase, session, persona);
    return NextResponse.json({ ok: true, ...esito });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
