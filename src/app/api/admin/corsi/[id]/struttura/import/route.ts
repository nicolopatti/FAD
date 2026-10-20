import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';
import { parseVimeoRef } from '@/lib/vimeo';
import type { LearningObjectType, RegolaCompletamento } from '@/lib/db-types';

type ImportRow = {
  titolo?: string;
  tipo?: 'video' | 'documento' | 'quiz' | null;
  riferimento?: string | null;
  durata_secondi?: number | null;
  obbligatorio?: boolean;
};

function defaultRegola(type: LearningObjectType): RegolaCompletamento {
  if (type === 'video') return { tipo: 'video_ended' };
  if (type === 'quiz') return { tipo: 'quiz_passed' };
  return { tipo: 'documento_completed' };
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as { rows?: ImportRow[] } | null;
  if (!body || !Array.isArray(body.rows)) {
    return NextResponse.json({ ok: false, error: 'rows mancante' }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  // Corso congelato (D22) ⇒ niente import (il trigger DB rifiuterebbe comunque).
  const { count: ediCount } = await supabase
    .from('edizione')
    .select('id', { count: 'exact', head: true })
    .eq('corso_id', params.id);
  if ((ediCount ?? 0) > 0) {
    return NextResponse.json({ ok: false, error: 'Corso congelato: la struttura non è modificabile.' }, { status: 409 });
  }

  // Indice dei LO attivi (per riuso per titolo) + LO già in struttura (per dedup).
  const { data: allLo } = await supabase
    .from('learning_object')
    .select('id, titolo, type, archiviato_at')
    .is('archiviato_at', null);
  const byTitle = new Map<string, { id: string; type: LearningObjectType }>();
  for (const lo of allLo ?? []) byTitle.set((lo.titolo as string).toLowerCase().trim(), { id: lo.id as string, type: lo.type as LearningObjectType });

  const { data: inCourse } = await supabase
    .from('struttura_corso')
    .select('learning_object_id, ordine')
    .eq('corso_id', params.id);
  const usedLo = new Set((inCourse ?? []).map((s) => s.learning_object_id as string));
  let nextOrdine = (inCourse ?? []).reduce((m, s) => Math.max(m, (s.ordine as number) ?? 0), 0) + 1;

  let aggiunti = 0;
  const saltati: { titolo: string; motivo: string }[] = [];

  for (const r of body.rows) {
    const titolo = (r.titolo ?? '').trim();
    if (!titolo) { saltati.push({ titolo: '(vuoto)', motivo: 'titolo mancante' }); continue; }
    const key = titolo.toLowerCase();

    let loId: string;
    const existing = byTitle.get(key);
    if (existing) {
      loId = existing.id;
    } else {
      // Creazione al volo: video e test (il documento richiede l'upload del PDF;
      // il test nasce senza domande, da aggiungere dalla libreria).
      let nuovoType: LearningObjectType;
      let nuovoConfig: Record<string, unknown>;
      if (r.tipo === 'video') {
        const vimeo = parseVimeoRef(r.riferimento);
        const durata = r.durata_secondi;
        if (!vimeo || typeof durata !== 'number' || durata <= 0) { saltati.push({ titolo, motivo: 'video: ID/link Vimeo o durata mancanti' }); continue; }
        nuovoType = 'video';
        nuovoConfig = { vimeo_id: vimeo.vimeo_id, durata_secondi: Math.round(durata) };
        if (vimeo.vimeo_hash) nuovoConfig.vimeo_hash = vimeo.vimeo_hash;
      } else if (r.tipo === 'quiz') {
        const soglia = Number(r.riferimento);
        nuovoType = 'quiz';
        nuovoConfig = { soglia_percentuale: Number.isFinite(soglia) && soglia >= 0 && soglia <= 100 ? Math.round(soglia) : 70, tentativi_max: null, ordine_casuale: true, mostra_correzione: true };
      } else {
        saltati.push({ titolo, motivo: 'documento nuovo: caricalo prima in libreria' });
        continue;
      }
      const { data: createdLo, error: loErr } = await supabase
        .from('learning_object')
        .insert({ tenant_id: session.tenantId, type: nuovoType, titolo, config: nuovoConfig })
        .select('id, type, titolo')
        .single();
      if (loErr || !createdLo) { saltati.push({ titolo, motivo: loErr?.message ?? 'creazione LO fallita' }); continue; }
      loId = createdLo.id;
      byTitle.set(key, { id: createdLo.id, type: nuovoType });
      await appendEvent({
        tenantId: session.tenantId,
        eventType: 'learning_object.created',
        actor: { persona_id: session.personaId, type: 'persona' },
        subjectType: 'learning_object',
        subjectId: createdLo.id,
        payload: { type: nuovoType, titolo: createdLo.titolo },
      });
    }

    if (usedLo.has(loId)) { saltati.push({ titolo, motivo: 'già nel corso' }); continue; }

    const loType = byTitle.get(key)?.type ?? 'video';
    const { data: st, error: stErr } = await supabase
      .from('struttura_corso')
      .insert({
        tenant_id: session.tenantId,
        corso_id: params.id,
        learning_object_id: loId,
        ordine: nextOrdine,
        obbligatorio: r.obbligatorio ?? true,
        regola_completamento: defaultRegola(loType),
      })
      .select('id')
      .single();
    if (stErr || !st) { saltati.push({ titolo, motivo: stErr?.message ?? 'inserimento struttura fallito' }); continue; }
    usedLo.add(loId);
    nextOrdine += 1;
    aggiunti += 1;
  }

  if (aggiunti > 0) {
    await appendEvent({
      tenantId: session.tenantId,
      eventType: 'struttura.imported',
      actor: { persona_id: session.personaId, type: 'persona' },
      subjectType: 'corso',
      subjectId: params.id,
      payload: { aggiunti, saltati: saltati.length },
    });
  }

  return NextResponse.json({ ok: true, aggiunti, saltati });
}
