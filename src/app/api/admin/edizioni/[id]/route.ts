import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';

type UpdateBody = {
  codice?: string;
  data_inizio?: string | null;
  data_fine?: string | null;
  fad_apertura?: string | null;
  fad_chiusura?: string | null;
};

function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof body.codice === 'string') {
    const c = body.codice.trim();
    if (!c) return NextResponse.json({ ok: false, error: 'codice non valido' }, { status: 400 });
    updates.codice = c;
  }
  for (const k of ['data_inizio', 'data_fine', 'fad_apertura', 'fad_chiusura'] as const) {
    if (body[k] === undefined) continue;
    const v = body[k];
    if (v === null || v === '') {
      updates[k] = null;
    } else if (isIsoDate(v)) {
      updates[k] = v;
    } else {
      return NextResponse.json({ ok: false, error: `${k} non è una data ISO YYYY-MM-DD` }, { status: 400 });
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: 'nessun campo da aggiornare' }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('edizione')
    .update(updates)
    .eq('id', params.id)
    .select('id, corso_id, codice, data_inizio, data_fine, fad_apertura, fad_chiusura, concluso_at, annullato_at')
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await appendEvent(supabase, {
    tenantId: session.tenantId,
    eventType: 'edizione.updated',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'edizione',
    subjectId: data.id,
    payload: { corso_id: data.corso_id, codice: data.codice, updates: Object.keys(updates) },
  });

  return NextResponse.json({ ok: true, edizione: data });
}
