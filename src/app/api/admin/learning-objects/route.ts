import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';
import type { LearningObjectType } from '@/lib/db-types';
import { validateDocumentoConfig, validateVideoConfig } from '@/lib/lo-config';
import { validaConfigQuiz } from '@/lib/quiz';

type CreateBody = {
  id?: string;
  type?: LearningObjectType;
  titolo?: string;
  config?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as CreateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });

  const { id, type, titolo, config } = body;
  if (type !== 'video' && type !== 'documento' && type !== 'quiz') {
    return NextResponse.json({ ok: false, error: 'type non valido' }, { status: 400 });
  }
  if (typeof titolo !== 'string' || titolo.trim() === '') {
    return NextResponse.json({ ok: false, error: 'titolo mancante' }, { status: 400 });
  }
  if (!config || typeof config !== 'object') {
    return NextResponse.json({ ok: false, error: 'config mancante' }, { status: 400 });
  }

  const normalizedConfig =
    type === 'video'
      ? validateVideoConfig(config)
      : type === 'quiz'
        ? validaConfigQuiz(config)
        : validateDocumentoConfig(config, session.tenantId);
  if (typeof normalizedConfig === 'string') {
    return NextResponse.json({ ok: false, error: normalizedConfig }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const insertPayload: Record<string, unknown> = {
    type,
    titolo: titolo.trim(),
    config: normalizedConfig,
    tenant_id: session.tenantId,
  };
  if (typeof id === 'string' && id.trim() !== '') {
    insertPayload.id = id.trim();
  }

  const { data, error } = await supabase
    .from('learning_object')
    .insert(insertPayload)
    .select('id, type, titolo, config, archiviato_at, creato_il')
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'learning_object.created',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'learning_object',
    subjectId: data.id,
    payload: { type, titolo: data.titolo },
  });

  return NextResponse.json({ ok: true, learning_object: data });
}
