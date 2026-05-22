import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';

type CreateBody = {
  titolo?: string;
  descrizione?: string | null;
  sblocco_sequenziale?: boolean;
};

export async function POST(request: Request) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as CreateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });

  const titolo = body.titolo?.trim();
  if (!titolo) {
    return NextResponse.json({ ok: false, error: 'titolo mancante' }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('corso')
    .insert({
      tenant_id: session.tenantId,
      titolo,
      descrizione: body.descrizione?.trim() || null,
      sblocco_sequenziale: body.sblocco_sequenziale ?? true,
    })
    .select('id, titolo, descrizione, sblocco_sequenziale, creato_il')
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await appendEvent(supabase, {
    tenantId: session.tenantId,
    eventType: 'corso.created',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'corso',
    subjectId: data.id,
    payload: { titolo: data.titolo, sblocco_sequenziale: data.sblocco_sequenziale },
  });

  return NextResponse.json({ ok: true, corso: data });
}
