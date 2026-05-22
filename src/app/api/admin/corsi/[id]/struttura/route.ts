import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';
import type { LearningObjectType, RegolaCompletamento } from '@/lib/db-types';

type AddBody = {
  learning_object_id?: string;
  obbligatorio?: boolean;
};

function defaultRegola(type: LearningObjectType): RegolaCompletamento {
  return type === 'video'
    ? { tipo: 'video_ended' }
    : { tipo: 'documento_completed' };
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as AddBody | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });

  const loId = body.learning_object_id;
  if (typeof loId !== 'string' || !loId) {
    return NextResponse.json({ ok: false, error: 'learning_object_id mancante' }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  // Recupera il tipo del LO per impostare la regola_completamento di default.
  // RLS lo limita al tenant corretto.
  const { data: lo, error: errLo } = await supabase
    .from('learning_object')
    .select('id, type, titolo, archiviato_at')
    .eq('id', loId)
    .single();
  if (errLo || !lo) {
    return NextResponse.json({ ok: false, error: 'learning_object non trovato' }, { status: 404 });
  }
  if (lo.archiviato_at) {
    return NextResponse.json({ ok: false, error: 'learning_object archiviato' }, { status: 400 });
  }

  // Calcola il prossimo ordine come max(ordine)+1 nella struttura.
  const { data: maxRow } = await supabase
    .from('struttura_corso')
    .select('ordine')
    .eq('corso_id', params.id)
    .order('ordine', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrdine = (maxRow?.ordine ?? 0) + 1;

  const { data, error } = await supabase
    .from('struttura_corso')
    .insert({
      tenant_id: session.tenantId,
      corso_id: params.id,
      learning_object_id: loId,
      ordine: nextOrdine,
      obbligatorio: body.obbligatorio ?? true,
      regola_completamento: defaultRegola(lo.type as LearningObjectType),
    })
    .select('id, ordine, obbligatorio, regola_completamento, learning_object_id')
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await appendEvent(supabase, {
    tenantId: session.tenantId,
    eventType: 'struttura.added',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'corso',
    subjectId: params.id,
    payload: {
      struttura_id: data.id,
      learning_object_id: loId,
      lo_titolo: lo.titolo,
      ordine: data.ordine,
    },
  });

  return NextResponse.json({ ok: true, struttura: data });
}
