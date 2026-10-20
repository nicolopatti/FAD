import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';
import type { CategoriaRow } from '@/lib/db-types';
import { pulisciNomeCategoria } from '@/lib/anagrafiche';

type Body = { nome?: unknown; ordine?: unknown };

/**
 * Rinomina o riordina una categoria. La rinomina si propaga ai corsi in bozza
 * (categoria non ancora congelata); i corsi attivi o conclusi tengono il nome
 * con cui sono nati (D22), ed è il motivo per cui il catalogo filtra per testo.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });
  const supabase = createSupabaseServerClient();

  const { data: cat } = await supabase.from('categoria').select('id, tenant_id, nome, ordine, creato_il').eq('id', params.id).maybeSingle<CategoriaRow>();
  if (!cat) return NextResponse.json({ ok: false, error: 'categoria non trovata' }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (body.nome !== undefined) {
    const nome = pulisciNomeCategoria(body.nome);
    if (!nome) return NextResponse.json({ ok: false, error: 'nome non valido (1–60 caratteri)' }, { status: 400 });
    updates.nome = nome;
  }
  if (body.ordine !== undefined) {
    const o = Number(body.ordine);
    if (!Number.isInteger(o) || o < 0 || o > 100000) return NextResponse.json({ ok: false, error: 'ordine non valido' }, { status: 400 });
    updates.ordine = o;
  }
  if (!Object.keys(updates).length) return NextResponse.json({ ok: false, error: 'nessun campo da aggiornare' }, { status: 400 });

  const { data, error } = await supabase.from('categoria').update(updates).eq('id', cat.id).select('id, tenant_id, nome, ordine, creato_il').single<CategoriaRow>();
  if (error) {
    const msg = error.code === '23505' ? 'Esiste già una categoria con questo nome.' : error.message;
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  let corsiAggiornati = 0;
  if (typeof updates.nome === 'string' && updates.nome !== cat.nome) {
    // Propaga ai soli corsi in bozza: quelli con edizioni sono congelati.
    const { data: corsi } = await supabase.from('corso').select('id').eq('categoria', cat.nome);
    const ids = (corsi ?? []).map((c) => c.id as string);
    const { data: conEdizioni } = ids.length ? await supabase.from('edizione').select('corso_id').in('corso_id', ids) : { data: [] };
    const congelati = new Set((conEdizioni ?? []).map((e) => e.corso_id as string));
    for (const c of corsi ?? []) {
      if (congelati.has(c.id as string)) continue;
      const { error: e } = await supabase.from('corso').update({ categoria: updates.nome }).eq('id', c.id);
      if (!e) corsiAggiornati += 1;
    }
    await appendEvent({
      tenantId: session.tenantId,
      eventType: 'categoria.updated',
      actor: { persona_id: session.personaId, type: 'persona' },
      subjectType: 'categoria',
      subjectId: cat.id,
      payload: { titolo: data.nome, titolo_precedente: cat.nome, corsi_aggiornati: corsiAggiornati },
    });
  }
  return NextResponse.json({ ok: true, categoria: data, corsi_aggiornati: corsiAggiornati });
}

/** Elimina una categoria non usata da alcun corso (i corsi che la usano la tengono come testo). */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { data: cat } = await supabase.from('categoria').select('id, nome').eq('id', params.id).maybeSingle<{ id: string; nome: string }>();
  if (!cat) return NextResponse.json({ ok: false, error: 'categoria non trovata' }, { status: 404 });
  const { count } = await supabase.from('corso').select('id', { count: 'exact', head: true }).eq('categoria', cat.nome);
  if ((count ?? 0) > 0) {
    return NextResponse.json({ ok: false, error: `La categoria è usata da ${count} ${count === 1 ? 'corso' : 'corsi'}: cambia prima la categoria di quei corsi (o rinominala).` }, { status: 409 });
  }
  const { error } = await supabase.from('categoria').delete().eq('id', cat.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'categoria.removed',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'categoria',
    subjectId: cat.id,
    payload: { titolo: cat.nome },
  });
  return NextResponse.json({ ok: true });
}
