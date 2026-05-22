import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { appendEvent } from '@/lib/audit';
import { computeProgressoForIscrizione } from '@/lib/compliance';

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

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: persona } = await supabase
    .from('persona')
    .select('id, tenant_id')
    .eq('auth_user_id', user.id)
    .single();
  if (!persona) return NextResponse.json({ ok: false }, { status: 403 });

  const { data: iscrizione } = await supabase
    .from('iscrizione')
    .select('id, persona_id')
    .eq('id', iscrizioneId)
    .maybeSingle();
  if (!iscrizione || iscrizione.persona_id !== persona.id) {
    return NextResponse.json({ ok: false, error: 'iscrizione non valida' }, { status: 403 });
  }

  // D26 — enforcement server-side dello sblocco sequenziale anche sull'API
  // del documento. Una chiamata diretta su un LO bloccato deve fallire.
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

  await appendEvent(supabase, {
    tenantId: persona.tenant_id,
    eventType,
    actor: { persona_id: persona.id, type: 'persona' },
    subjectType: 'learning_object',
    subjectId: learningObjectId,
    payload: {
      iscrizione_id: iscrizione.id,
      ...(payload ?? {}),
    },
  });

  return NextResponse.json({ ok: true });
}
