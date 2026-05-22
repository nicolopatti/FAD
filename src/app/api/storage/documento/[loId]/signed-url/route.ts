import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { computeProgressoForIscrizione } from '@/lib/compliance';
import type { LearningObjectRow } from '@/lib/db-types';

// 1 ora: tempo abbondante per sfogliare un PDF di formazione tipico
// senza dover ri-firmare l'URL. Il browser comunque scarica il file
// una volta e lo tiene in memoria.
const SIGNED_URL_TTL_SECONDS = 3600;

export async function GET(
  request: Request,
  { params }: { params: { loId: string } },
) {
  const url = new URL(request.url);
  const iscrizioneId = url.searchParams.get('iscrizione_id');
  if (!iscrizioneId) {
    return NextResponse.json({ ok: false, error: 'iscrizione_id mancante' }, { status: 400 });
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

  // D26 — anche per accedere al PDF serve che il LO sia sbloccato.
  const progresso = await computeProgressoForIscrizione(supabase, iscrizione.id);
  if (!progresso) return NextResponse.json({ ok: false }, { status: 403 });
  const item = progresso.items.find((i) => i.learning_object_id === params.loId);
  if (!item) {
    return NextResponse.json({ ok: false, error: 'LO non in corso' }, { status: 403 });
  }
  if (!item.sbloccato) {
    return NextResponse.json(
      { ok: false, error: 'LO non sbloccato (sblocco_sequenziale)' },
      { status: 403 },
    );
  }

  const { data: lo } = await supabase
    .from('learning_object')
    .select('id, type, config')
    .eq('id', params.loId)
    .maybeSingle<LearningObjectRow>();
  if (!lo || lo.type !== 'documento') {
    return NextResponse.json({ ok: false, error: 'LO non è un documento' }, { status: 400 });
  }
  const storageKey = (lo.config as { storage_key?: string }).storage_key;
  if (typeof storageKey !== 'string' || !storageKey) {
    return NextResponse.json({ ok: false, error: 'storage_key mancante nel config' }, { status: 500 });
  }

  const { data: signed, error } = await supabase
    .storage
    .from('documenti')
    .createSignedUrl(storageKey, SIGNED_URL_TTL_SECONDS);
  if (error || !signed?.signedUrl) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? 'errore createSignedUrl' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    signed_url: signed.signedUrl,
    expires_in: SIGNED_URL_TTL_SECONDS,
  });
}
