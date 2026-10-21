import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';

/**
 * Nuovo ordine delle categorie del tenant in una sola istruzione (upsert su id):
 * o cambia tutto o niente, mai un ordine a metà. `ids` deve contenere esattamente
 * le categorie del tenant. L'ordine è editoriale: nessun Evento (come prima).
 */
export async function PUT(request: Request) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : null;
  if (!ids || !ids.length || ids.length > 500) return NextResponse.json({ ok: false, error: 'ids mancante' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: esistenti, error: errLettura } = await supabase.from('categoria').select('id, tenant_id, nome');
  if (errLettura) return NextResponse.json({ ok: false, error: errLettura.message }, { status: 400 });
  const perId = new Map((esistenti ?? []).map((c) => [c.id as string, c]));
  if (new Set(ids).size !== ids.length || ids.length !== perId.size || ids.some((id) => !perId.has(id))) {
    return NextResponse.json({ ok: false, error: 'L’elenco è cambiato nel frattempo: ricarica la pagina.' }, { status: 409 });
  }

  const righe = ids.map((id, i) => ({ id, tenant_id: session.tenantId, nome: perId.get(id)!.nome as string, ordine: i + 1 }));
  const { error } = await supabase.from('categoria').upsert(righe, { onConflict: 'id' });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
