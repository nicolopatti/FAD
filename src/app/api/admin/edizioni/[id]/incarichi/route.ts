import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';
import { INCARICO_RUOLI, type IncaricoRuolo } from '@/lib/db-types';
import { isEmail } from '@/lib/validazione';

type Body = {
  ruolo?: IncaricoRuolo;
  persona_id?: string;
  /** In alternativa a persona_id: una persona nuova (o trovata per email nel tenant). */
  nome?: string;
  cognome?: string;
  email?: string;
};

/**
 * Assegna un docente o tutor all'edizione (incarico, D30). La persona si sceglie
 * tra quelle del tenant oppure si crea al volo (dedup per email). Eventi senza
 * PII: solo UUID e ruolo.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });
  if (!body.ruolo || !INCARICO_RUOLI.includes(body.ruolo)) return NextResponse.json({ ok: false, error: 'ruolo non valido' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: edizione } = await supabase.from('edizione').select('id').eq('id', params.id).maybeSingle();
  if (!edizione) return NextResponse.json({ ok: false, error: 'edizione non trovata' }, { status: 404 });

  let personaId = body.persona_id?.trim() || null;
  if (!personaId) {
    const nome = body.nome?.trim(); const cognome = body.cognome?.trim(); const email = body.email?.trim().toLowerCase();
    if (!nome || !cognome || !email) return NextResponse.json({ ok: false, error: 'nome, cognome ed email sono obbligatori' }, { status: 400 });
    if (!isEmail(email)) return NextResponse.json({ ok: false, error: 'email non valida' }, { status: 400 });
    const { data: esistente } = await supabase.from('persona').select('id').eq('tenant_id', session.tenantId).ilike('email', email).maybeSingle();
    if (esistente) {
      personaId = esistente.id as string;
    } else {
      const { data: nuova, error } = await supabase.from('persona').insert({ tenant_id: session.tenantId, nome, cognome, email }).select('id').single();
      if (error || !nuova) return NextResponse.json({ ok: false, error: error?.message ?? 'creazione persona fallita' }, { status: 400 });
      personaId = nuova.id as string;
      await appendEvent({
        tenantId: session.tenantId,
        eventType: 'persona.created',
        actor: { persona_id: session.personaId, type: 'persona' },
        subjectType: 'persona',
        subjectId: personaId,
        payload: { origine: 'incarico' },
      });
    }
  } else {
    const { data: p } = await supabase.from('persona').select('id').eq('id', personaId).maybeSingle();
    if (!p) return NextResponse.json({ ok: false, error: 'persona non trovata' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('incarico')
    .insert({ tenant_id: session.tenantId, edizione_id: params.id, persona_id: personaId, ruolo: body.ruolo })
    .select('id, edizione_id, persona_id, ruolo')
    .single();
  if (error) {
    const msg = /duplicate|unique/i.test(error.message) ? 'Questa persona ha già questo ruolo nell’edizione.' : error.message;
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'incarico.created',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'incarico',
    subjectId: data.id,
    payload: { edizione_id: data.edizione_id, persona_id: data.persona_id, ruolo: data.ruolo },
  });

  return NextResponse.json({ ok: true, incarico: data });
}
