import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';

type UpdateBody = {
  titolo?: string;
  descrizione?: string | null;
  sblocco_sequenziale?: boolean;
};

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof body.titolo === 'string') {
    const t = body.titolo.trim();
    if (!t) return NextResponse.json({ ok: false, error: 'titolo non valido' }, { status: 400 });
    updates.titolo = t;
  }
  if (body.descrizione !== undefined) {
    updates.descrizione = typeof body.descrizione === 'string'
      ? (body.descrizione.trim() || null)
      : null;
  }
  if (typeof body.sblocco_sequenziale === 'boolean') {
    updates.sblocco_sequenziale = body.sblocco_sequenziale;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: 'nessun campo da aggiornare' }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('corso')
    .update(updates)
    .eq('id', params.id)
    .select('id, titolo, descrizione, sblocco_sequenziale, creato_il')
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await appendEvent(supabase, {
    tenantId: session.tenantId,
    eventType: 'corso.updated',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'corso',
    subjectId: data.id,
    payload: { titolo: data.titolo, sblocco_sequenziale: data.sblocco_sequenziale },
  });

  return NextResponse.json({ ok: true, corso: data });
}
