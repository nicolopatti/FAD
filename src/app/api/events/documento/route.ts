import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { provaEmissioneAutomatica } from '@/lib/attestati';
import { computeProgressoForIscrizione } from '@/lib/compliance';
import { ErroreRegistrazione, registraEventoPlayer } from '@/lib/eventi-player';

const ALLOWED = new Set(['documento.opened', 'documento.completed']);

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

  // D26 — enforcement server-side dello sblocco sequenziale anche sull'API
  // del documento (regola completa); la RPC lo ripete "per Eventi" nel DB.
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

  const cleanPayload: Record<string, unknown> = { ...(payload ?? {}) };
  delete cleanPayload.iscrizione_id;
  let esito;
  try {
    esito = await registraEventoPlayer(supabase, { iscrizioneId, learningObjectId, eventType, payload: cleanPayload });
  } catch (err) {
    if (err instanceof ErroreRegistrazione) return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  // Fase 5: emissione automatica dell'attestato se il percorso è completo.
  const attestato = eventType === 'documento.completed' ? await provaEmissioneAutomatica(iscrizioneId, esito.persona_id) : null;

  return NextResponse.json({ ok: true, attestato: attestato ? { numero: attestato.numero } : null });
}
