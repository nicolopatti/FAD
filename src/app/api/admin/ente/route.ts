import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';

type Body = {
  ragione_sociale?: string | null;
  citta?: string | null;
  firmatario_nome?: string | null;
  firmatario_ruolo?: string | null;
  logo_path?: string | null;
  firma_path?: string | null;
  linkedin_organization_id?: string | null;
};

const CAMPI: (keyof Body)[] = ['ragione_sociale', 'citta', 'firmatario_nome', 'firmatario_ruolo', 'logo_path', 'firma_path', 'linkedin_organization_id'];

// Dati dell'ente emittente (intestazione, firmatario, logo) usati dagli attestati
// emessi DA QUI IN POI: gli attestati già emessi restano com'erano (snapshot).
export async function PATCH(request: Request) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });
  const updates: Record<string, string | null> = {};
  for (const k of CAMPI) {
    if (body[k] !== undefined) updates[k] = typeof body[k] === 'string' ? ((body[k] as string).trim().slice(0, 200) || null) : null;
  }
  if (updates.linkedin_organization_id && !/^\d{1,12}$/.test(updates.linkedin_organization_id)) {
    return NextResponse.json({ ok: false, error: 'L’ID della pagina LinkedIn è un numero (lo trovi nell’URL della pagina aziendale su LinkedIn).' }, { status: 400 });
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ ok: false, error: 'nessun campo' }, { status: 400 });
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from('tenant').update(updates).eq('id', session.tenantId).select('id').maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ ok: false, error: 'ente non aggiornato' }, { status: 403 });
  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'ente.updated',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'tenant',
    subjectId: session.tenantId,
    payload: { campi: Object.keys(updates) },
  });
  return NextResponse.json({ ok: true });
}
