import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';
import { edizioneStato } from '@/lib/db-types';
import { OFFERTA_SELECT, offertaDaBody, rispostaErroreOfferta } from '@/lib/offerte';
import type { OffertaInput, OffertaRow, OffertaValori } from '@/lib/vendita';

type Body = OffertaInput & { azione?: 'pubblica' | 'ritira' };

const CAMPI: (keyof OffertaValori)[] = [
  'slug', 'prezzo_centesimi', 'aliquota_iva', 'natura_iva', 'posti_max', 'accesso_giorni',
  'vendita_dal', 'vendita_al', 'codici_sconto', 'titolo_pubblico', 'descrizione_pubblica',
  'chiusa_visibile', 'sconti',
];

// Confronto per campo. Gli sconti sono un elenco di oggetti e jsonb riordina le
// chiavi: si confrontano con le chiavi in ordine. L'aliquota può tornare come
// testo ("22.00"): si confronta il valore numerico.
function normalizza(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normalizza);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, normalizza((v as Record<string, unknown>)[k])]));
  }
  if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)) return Number(v);
  return v ?? null;
}
const uguale = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Fase 6: modifica dell'offerta (form completo) oppure {azione: 'pubblica'|'ritira'}.
// Il prezzo vale per gli ordini futuri: ogni ordine copia prezzo e IVA alla
// creazione. Eventi: offerta.updated {slug, campi} / offerta.published / offerta.withdrawn.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as Body | null;
  const supabase = await createSupabaseServerClient();
  const { data: off } = await supabase
    .from('offerta')
    .select(`${OFFERTA_SELECT}, edizione:edizione_id ( concluso_at, annullato_at )`)
    .eq('id', params.id)
    .maybeSingle<OffertaRow & { edizione: { concluso_at: string | null; annullato_at: string | null } | null }>();
  if (!off) return NextResponse.json({ ok: false, error: 'Offerta non trovata.' }, { status: 404 });
  const attore = { persona_id: session.personaId, type: 'persona' as const };

  if (body?.azione === 'pubblica' || body?.azione === 'ritira') {
    const pubblica = body.azione === 'pubblica';
    if (pubblica && (!off.edizione || edizioneStato(off.edizione) !== 'attiva')) {
      return NextResponse.json({ ok: false, error: 'L’edizione non è attiva: non si può mettere in vendita.' }, { status: 409 });
    }
    if ((pubblica && off.stato === 'pubblicata') || (!pubblica && off.stato !== 'pubblicata')) {
      return NextResponse.json({ ok: false, error: pubblica ? 'L’offerta è già pubblicata.' : 'L’offerta non è pubblicata.' }, { status: 409 });
    }
    const ora = new Date().toISOString();
    const { data, error } = await supabase
      .from('offerta')
      .update(pubblica ? { stato: 'pubblicata', pubblicata_il: ora } : { stato: 'ritirata', ritirata_il: ora })
      .eq('id', off.id)
      .select(OFFERTA_SELECT)
      .single();
    if (error) return rispostaErroreOfferta(error);
    await appendEvent({
      tenantId: session.tenantId,
      eventType: pubblica ? 'offerta.published' : 'offerta.withdrawn',
      actor: attore,
      subjectType: 'offerta',
      subjectId: off.id,
      payload: { slug: data.slug, edizione_id: off.edizione_id },
    });
    return NextResponse.json({ ok: true, offerta: data });
  }

  const parsed = offertaDaBody(body);
  if ('risposta' in parsed) return parsed.risposta;
  const prima = off as unknown as Record<string, unknown>;
  const cambiati = CAMPI.filter((k) => !uguale(normalizza(parsed.valori[k]), normalizza(prima[k])));
  if (!cambiati.length) return NextResponse.json({ ok: true, offerta: off, invariata: true });

  const { data, error } = await supabase.from('offerta').update(parsed.valori).eq('id', off.id).select(OFFERTA_SELECT).single();
  if (error) return rispostaErroreOfferta(error);
  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'offerta.updated',
    actor: attore,
    subjectType: 'offerta',
    subjectId: off.id,
    payload: { slug: data.slug, campi: cambiati },
  });
  return NextResponse.json({ ok: true, offerta: data });
}
