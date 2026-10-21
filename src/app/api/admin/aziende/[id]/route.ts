import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';
import type { AziendaRow } from '@/lib/db-types';
import { AZIENDA_SELECT, campiAzienda, erroreAzienda, type AziendaBody } from '@/lib/anagrafiche';

/** Modifica dei dati di un'azienda. Evento `azienda.updated` con i soli nomi dei campi. */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as AziendaBody | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });
  const v = campiAzienda(body, true);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  if (!Object.keys(v.updates).length) return NextResponse.json({ ok: false, error: 'nessun campo da aggiornare' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('azienda').update(v.updates).eq('id', params.id).select(AZIENDA_SELECT).maybeSingle<AziendaRow>();
  if (error) return NextResponse.json({ ok: false, error: erroreAzienda(error) }, { status: 400 });
  if (!data) return NextResponse.json({ ok: false, error: 'azienda non trovata' }, { status: 404 });
  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'azienda.updated',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'azienda',
    subjectId: data.id,
    payload: { campi: Object.keys(v.updates) },
  });
  return NextResponse.json({ ok: true, azienda: data });
}
