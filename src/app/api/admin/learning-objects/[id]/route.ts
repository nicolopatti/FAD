import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';
import { validaConfigQuiz } from '@/lib/quiz';
import { validateDocumentoConfig, validateVideoConfig } from '@/lib/lo-config';

type UpdateBody = {
  titolo?: string;
  /**
   * Nuova configurazione: per i test soglia/tentativi/ordine/correzione (fissati
   * con D22); per video e documento la sostituzione del video o del file (sempre
   * ammessa: D22 protegge la sequenza del corso, non il contenuto della lezione).
   */
  config?: Record<string, unknown>;
};

// Il LO è usato in un corso con almeno un'edizione? (freeze D22, calcolato con
// il client RLS dell'admin: struttura → corso → edizioni)
async function loCongelato(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, loId: string): Promise<boolean> {
  const { data: righe } = await supabase.from('struttura_corso').select('corso_id').eq('learning_object_id', loId);
  const corsi = Array.from(new Set((righe ?? []).map((r) => r.corso_id as string)));
  if (corsi.length === 0) return false;
  const { count } = await supabase.from('edizione').select('id', { count: 'exact', head: true }).in('corso_id', corsi);
  return (count ?? 0) > 0;
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const updates: Record<string, unknown> = {};
  if (typeof body.titolo === 'string') {
    const t = body.titolo.trim();
    if (t === '') {
      return NextResponse.json({ ok: false, error: 'titolo non valido' }, { status: 400 });
    }
    updates.titolo = t;
  }
  if (body.config && typeof body.config === 'object') {
    const { data: lo } = await supabase.from('learning_object').select('type').eq('id', params.id).maybeSingle();
    if (!lo) return NextResponse.json({ ok: false, error: 'contenuto non trovato' }, { status: 404 });
    if (lo.type === 'quiz') {
      const cfg = validaConfigQuiz(body.config);
      if (typeof cfg === 'string') return NextResponse.json({ ok: false, error: cfg }, { status: 400 });
      if (await loCongelato(supabase, params.id)) {
        return NextResponse.json({ ok: false, error: 'Il test è una lezione di un corso attivo: soglia e regole non si possono più modificare.' }, { status: 409 });
      }
      updates.config = cfg;
    } else {
      const cfg = lo.type === 'video' ? validateVideoConfig(body.config) : validateDocumentoConfig(body.config, session.tenantId);
      if (typeof cfg === 'string') return NextResponse.json({ ok: false, error: cfg }, { status: 400 });
      updates.config = cfg;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: 'nessun campo da aggiornare' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('learning_object')
    .update(updates)
    .eq('id', params.id)
    .select('id, type, titolo, config, archiviato_at, creato_il')
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'learning_object.updated',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'learning_object',
    subjectId: data.id,
    payload: { titolo: data.titolo, ...(updates.config ? { config: updates.config } : {}) },
  });

  return NextResponse.json({ ok: true, learning_object: data });
}
