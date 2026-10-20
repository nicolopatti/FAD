import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';
import type { AziendaRow } from '@/lib/db-types';
import { AZIENDA_SELECT, campiAzienda, erroreAzienda, type AziendaBody } from '@/lib/anagrafiche';

/** Nuova azienda (dalla pagina Aziende). Evento `azienda.created` senza dati. */
export async function POST(request: Request) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as AziendaBody | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });
  const v = campiAzienda(body, false);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from('azienda').insert({ tenant_id: session.tenantId, ...v.updates }).select(AZIENDA_SELECT).single<AziendaRow>();
  if (error) return NextResponse.json({ ok: false, error: erroreAzienda(error) }, { status: 400 });
  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'azienda.created',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'azienda',
    subjectId: data.id,
    payload: { origine: 'admin', ha_partita_iva: data.partita_iva !== null },
  });
  return NextResponse.json({ ok: true, azienda: data });
}
