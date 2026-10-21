import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { computeProgressoForIscrizione } from '@/lib/compliance';
import { coperturaSecondi, normalizzaSegmenti } from '@/lib/visione';
import { provaEmissioneAutomatica } from '@/lib/attestati';
import { ErroreRegistrazione, registraEventoPlayer } from '@/lib/eventi-player';

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

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  // D26 — enforcement server-side dello sblocco sequenziale anche sull'API,
  // con la regola completa (visione integrale: copertura ricostruita dal log).
  // La RPC ripete il controllo "per Eventi" nel DB (titolarità, LO in corso).
  const progresso = await computeProgressoForIscrizione(supabase, iscrizioneId);
  if (!progresso) return NextResponse.json({ ok: false, error: 'iscrizione non valida' }, { status: 403 });
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
  delete cleanPayload.iscrizione_id;
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

  let esito;
  try {
    esito = await registraEventoPlayer(supabase, { iscrizioneId, learningObjectId, eventType, payload: cleanPayload });
  } catch (err) {
    if (err instanceof ErroreRegistrazione) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  // Fase 5: se questo era l'ultimo passo, l'attestato si emette da solo
  // (politica `automatica`). Mai un errore verso il player.
  const attestato = eventType === 'video.ended' ? await provaEmissioneAutomatica(iscrizioneId, esito.persona_id) : null;

  return NextResponse.json({ ok: true, attestato: attestato ? { numero: attestato.numero } : null });
}
