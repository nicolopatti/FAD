import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';
import type { DocumentoConfig, LearningObjectType, VideoConfig } from '@/lib/db-types';

type CreateBody = {
  id?: string;
  type?: LearningObjectType;
  titolo?: string;
  config?: Record<string, unknown>;
};

function validateVideoConfig(c: Record<string, unknown>): VideoConfig | string {
  const vimeoId = c.vimeo_id;
  const durata = c.durata_secondi;
  if (typeof vimeoId !== 'string' || vimeoId.trim() === '') {
    return 'config.vimeo_id mancante';
  }
  if (typeof durata !== 'number' || !Number.isFinite(durata) || durata <= 0) {
    return 'config.durata_secondi non valido';
  }
  return { vimeo_id: vimeoId.trim(), durata_secondi: Math.round(durata) };
}

function validateDocumentoConfig(
  c: Record<string, unknown>,
  tenantId: string,
): DocumentoConfig | string {
  const storageKey = c.storage_key;
  const mime = c.mime;
  const size = c.size;
  const filename = c.filename;
  if (typeof storageKey !== 'string' || !storageKey.startsWith(`${tenantId}/`)) {
    return 'config.storage_key deve iniziare con tenant_id/';
  }
  if (mime !== 'application/pdf') {
    return 'config.mime deve essere application/pdf';
  }
  if (typeof size !== 'number' || size <= 0) {
    return 'config.size non valido';
  }
  const out: DocumentoConfig = { storage_key: storageKey, mime, size };
  if (typeof filename === 'string' && filename.trim() !== '') {
    out.filename = filename.trim();
  }
  return out;
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as CreateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });

  const { id, type, titolo, config } = body;
  if (type !== 'video' && type !== 'documento') {
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
      : validateDocumentoConfig(config, session.tenantId);
  if (typeof normalizedConfig === 'string') {
    return NextResponse.json({ ok: false, error: normalizedConfig }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
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

  await appendEvent(supabase, {
    tenantId: session.tenantId,
    eventType: 'learning_object.created',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'learning_object',
    subjectId: data.id,
    payload: { type, titolo: data.titolo },
  });

  return NextResponse.json({ ok: true, learning_object: data });
}
