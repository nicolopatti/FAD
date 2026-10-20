import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { appendEvent } from '@/lib/audit';
import { computeProgressoForIscrizione } from '@/lib/compliance';
import { coperturaSecondi, normalizzaSegmenti } from '@/lib/visione';
import { provaEmissioneAutomatica } from '@/lib/attestati';

const ALLOWED = new Set(['video.play', 'video.pause', 'video.seek', 'video.ended', 'video.progress']);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });

  const {
    event_type: eventType,
    iscrizione_id: iscrizioneId,
    learning_object_id: learningObjectId,
    payload,
  } = body as {
    event_type?: string;
    iscrizione_id?: string;
    learning_object_id?: string;
    payload?: Record<string, unknown>;
  };

  if (!eventType || !iscrizioneId || !learningObjectId) {
    return NextResponse.json({ ok: false, error: 'parametri mancanti' }, { status: 400 });
  }
  if (!ALLOWED.has(eventType)) {
    return NextResponse.json({ ok: false, error: 'event_type non ammesso' }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: persona } = await supabase
    .from('persona')
    .select('id, tenant_id')
    .eq('auth_user_id', user.id)
    .single();
  if (!persona) return NextResponse.json({ ok: false }, { status: 403 });

  // L'iscrizione deve appartenere a questa persona (RLS lo garantirebbe,
  // ma controlliamo esplicitamente per dare 403 invece di 200 silenzioso).
  const { data: iscrizione } = await supabase
    .from('iscrizione')
    .select('id, persona_id')
    .eq('id', iscrizioneId)
    .maybeSingle();
  if (!iscrizione || iscrizione.persona_id !== persona.id) {
    return NextResponse.json({ ok: false, error: 'iscrizione non valida' }, { status: 403 });
  }

  // D26 — enforcement server-side dello sblocco sequenziale anche sull'API.
  // Una chiamata diretta a /api/events/video su un LO bloccato deve fallire.
  const progresso = await computeProgressoForIscrizione(supabase, iscrizione.id);
  if (!progresso) return NextResponse.json({ ok: false }, { status: 403 });
  const item = progresso.items.find((i) => i.learning_object_id === learningObjectId);
  if (!item) {
    return NextResponse.json({ ok: false, error: 'LO non in corso' }, { status: 403 });
  }
  if (!item.sbloccato) {
    return NextResponse.json(
      { ok: false, error: 'LO non sbloccato (sblocco_sequenziale)' },
      { status: 403 },
    );
  }

  // Tratti riprodotti (visione integrale): il client li manda come
  // `segmenti_visti`; qui si validano e si ritagliano sulla durata del video
  // (quella riportata dal player o, in mancanza, quella dichiarata nel LO).
  const cleanPayload: Record<string, unknown> = { ...(payload ?? {}) };
  delete cleanPayload.segmenti_visti;
  delete cleanPayload.copertura_secondi;
  if (payload && 'segmenti_visti' in payload) {
    const cfgDurata = Number((item.lo_config as { durata_secondi?: unknown }).durata_secondi);
    const playerDurata = Number(payload.durata_secondi);
    const durataMax = Math.max(
      Number.isFinite(cfgDurata) ? cfgDurata : 0,
      Number.isFinite(playerDurata) ? playerDurata : 0,
    );
    const segmenti = normalizzaSegmenti(payload.segmenti_visti, durataMax);
    if (segmenti.length) {
      cleanPayload.segmenti_visti = segmenti;
      cleanPayload.copertura_secondi = coperturaSecondi(segmenti);
    }
  }

  await appendEvent({
    tenantId: persona.tenant_id,
    eventType,
    actor: { persona_id: persona.id, type: 'persona' },
    subjectType: 'learning_object',
    subjectId: learningObjectId,
    payload: {
      iscrizione_id: iscrizione.id,
      ...cleanPayload,
    },
  });

  // Fase 5: se questo era l'ultimo passo, l'attestato si emette da solo
  // (politica `automatica`). Mai un errore verso il player.
  const attestato = eventType === 'video.ended' ? await provaEmissioneAutomatica(iscrizione.id, persona.id) : null;

  return NextResponse.json({ ok: true, attestato: attestato ? { numero: attestato.numero } : null });
}
