import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { invitaPersona, type PersonaDaInvitare } from '@/lib/inviti';

// Invita tutti gli iscritti dell'edizione che non hanno ancora un accesso.
// Uno alla volta (il mailer ha limiti): gli errori non fermano gli altri.
export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: iscrizioni, error } = await supabase
    .from('iscrizione')
    .select('id, persona:persona_id ( id, email, nome, auth_user_id )')
    .eq('edizione_id', params.id)
    .returns<{ id: string; persona: PersonaDaInvitare | null }[]>();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  const daInvitare = new Map<string, PersonaDaInvitare>();
  for (const i of iscrizioni ?? []) if (i.persona && !i.persona.auth_user_id) daInvitare.set(i.persona.id, i.persona);

  let inviati = 0;
  const errori: { email: string; errore: string }[] = [];
  for (const p of daInvitare.values()) {
    try {
      await invitaPersona(supabase, session, p);
      inviati++;
    } catch (err) {
      errori.push({ email: p.email, errore: err instanceof Error ? err.message : String(err) });
    }
  }
  return NextResponse.json({ ok: true, inviati, errori });
}
