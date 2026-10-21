import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { appendEvent } from '@/lib/audit';
import { richiedePasswordAttuale } from '@/lib/validazione';

// Cambio password dell'utente autenticato (dal profilo o dopo un link via
// email). L'aggiornamento è su Supabase Auth con la sessione dell'utente; poi
// un Evento `auth.password_aggiornata` senza alcun dato sensibile.
//
// B8 (stress test 21/10): se la sessione è nata da un accesso con password
// (`amr` del JWT contiene "password"), serve la password ATTUALE: una sessione
// lasciata aperta non basta a cambiarla. Una sessione nata da un link via email
// (invito, reimpostazione) non ha "password" nell'amr: lì la password attuale
// non c'è o è stata dimenticata, e il link ha già provato l'identità.

/** Verifica la password con un client a parte, senza toccare i cookie della sessione. */
async function passwordGiusta(email: string, password: string): Promise<boolean> {
  const verifica = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await verifica.auth.signInWithPassword({ email, password });
  if (!error) await verifica.auth.signOut({ scope: 'local' });
  return !error;
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Sessione scaduta: riapri il link o accedi di nuovo.' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { password?: unknown; password_attuale?: unknown } | null;
  const password = typeof body?.password === 'string' ? body.password : '';
  if (password.length < 10) return NextResponse.json({ ok: false, error: 'La password deve avere almeno 10 caratteri.' }, { status: 400 });

  const { data: claims } = await supabase.auth.getClaims();
  if (richiedePasswordAttuale(claims?.claims?.amr)) {
    const attuale = typeof body?.password_attuale === 'string' ? body.password_attuale : '';
    if (!attuale) return NextResponse.json({ ok: false, error: 'Scrivi la password attuale.', campo: 'password_attuale' }, { status: 400 });
    if (!user.email || !(await passwordGiusta(user.email, attuale))) {
      return NextResponse.json({ ok: false, error: 'La password attuale non è corretta.', campo: 'password_attuale' }, { status: 403 });
    }
  }

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
