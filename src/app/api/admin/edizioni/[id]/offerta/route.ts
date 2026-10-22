import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';
import { edizioneStato } from '@/lib/db-types';
import { OFFERTA_SELECT, offertaDaBody, rispostaErroreOfferta } from '@/lib/offerte';
import type { OffertaInput } from '@/lib/vendita';

// Fase 6: mette in vendita un'edizione (una sola offerta per edizione). Nasce in
// bozza: si pubblica con PATCH /api/admin/offerte/[id] {azione: 'pubblica'}.
// RLS: `offerta_insert_admin`; il trigger verifica che l'edizione sia dell'ente.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await requireAdmin();
  const parsed = offertaDaBody((await request.json().catch(() => null)) as OffertaInput | null);
  if ('risposta' in parsed) return parsed.risposta;

  const supabase = await createSupabaseServerClient();
  const { data: ed } = await supabase.from('edizione').select('id, concluso_at, annullato_at').eq('id', params.id).maybeSingle();
  if (!ed) return NextResponse.json({ ok: false, error: 'Edizione non trovata.' }, { status: 404 });
  if (edizioneStato(ed) !== 'attiva') {
    return NextResponse.json({ ok: false, error: 'Si mettono in vendita solo le edizioni attive.' }, { status: 409 });
  }
  const { count } = await supabase.from('offerta').select('id', { count: 'exact', head: true }).eq('edizione_id', ed.id);
  if (count) return NextResponse.json({ ok: false, error: 'Questa edizione ha già un’offerta: modificala.' }, { status: 409 });

  const { data, error } = await supabase
    .from('offerta')
    .insert({ tenant_id: session.tenantId, edizione_id: ed.id, stato: 'bozza', ...parsed.valori })
    .select(OFFERTA_SELECT)
    .single();
  if (error) return rispostaErroreOfferta(error);

  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'offerta.created',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'offerta',
    subjectId: data.id,
    payload: { edizione_id: ed.id, slug: data.slug, prezzo_centesimi: data.prezzo_centesimi, accesso_giorni: data.accesso_giorni },
  });

  return NextResponse.json({ ok: true, offerta: data });
}
