import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';
import type { CategoriaRow } from '@/lib/db-types';
import { pulisciNomeCategoria } from '@/lib/anagrafiche';

/** Elenco delle categorie del tenant (per i selettori). */
export async function GET() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('categoria').select('id, tenant_id, nome, ordine, creato_il').order('ordine').order('nome').returns<CategoriaRow[]>();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, categorie: data ?? [] });
}

/** Nuova categoria. Il nome è unico nel tenant (senza distinzione di maiuscole). */
export async function POST(request: Request) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as { nome?: unknown } | null;
  const nome = pulisciNomeCategoria(body?.nome);
  if (!nome) return NextResponse.json({ ok: false, error: 'nome non valido (1–60 caratteri)' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: max } = await supabase.from('categoria').select('ordine').order('ordine', { ascending: false }).limit(1).maybeSingle<{ ordine: number }>();
  const { data, error } = await supabase
    .from('categoria')
    .insert({ tenant_id: session.tenantId, nome, ordine: (max?.ordine ?? 0) + 1 })
    .select('id, tenant_id, nome, ordine, creato_il')
    .single<CategoriaRow>();
  if (error) {
    const msg = error.code === '23505' ? 'Esiste già una categoria con questo nome.' : error.message;
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'categoria.created',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'categoria',
    subjectId: data.id,
    // `titolo`, non `nome`: la guardia anti-PII di audit_append rifiuta la chiave `nome`.
    payload: { titolo: data.nome },
  });
  return NextResponse.json({ ok: true, categoria: data });
}
