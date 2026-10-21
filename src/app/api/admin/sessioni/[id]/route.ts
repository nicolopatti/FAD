import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';

type Body = {
  titolo?: string;
  data_ora?: string | null;
  durata_minuti?: number | null;
  vcs_meeting_id?: string | null;
  /** Incarico (docente o tutor dell'edizione) che tiene la sessione; null = nessuno. */
  incarico_id?: string | null;
  /** true = annulla la sessione (resta nel registro come annullata). */
  annulla?: boolean;
};

/** Modifica di una sessione: titolo, quando, durata, riunione, docente; oppure annullamento. */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: cur } = await supabase.from('sessione').select('id, edizione_id, titolo, annullato_at, modalita').eq('id', params.id).maybeSingle();
  if (!cur) return NextResponse.json({ ok: false, error: 'sessione non trovata' }, { status: 404 });

  if (body.annulla === true) {
    if (cur.annullato_at) return NextResponse.json({ ok: false, error: 'sessione già annullata' }, { status: 409 });
    const { error } = await supabase.from('sessione').update({ annullato_at: new Date().toISOString() }).eq('id', cur.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    await appendEvent({
      tenantId: session.tenantId,
      eventType: 'sessione.cancelled',
      actor: { persona_id: session.personaId, type: 'persona' },
      subjectType: 'sessione',
      subjectId: cur.id,
      payload: { edizione_id: cur.edizione_id, titolo: cur.titolo },
    });
    return NextResponse.json({ ok: true });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.titolo === 'string') {
    const t = body.titolo.trim();
    if (!t) return NextResponse.json({ ok: false, error: 'titolo non valido' }, { status: 400 });
    updates.titolo = t;
  }
  if (body.data_ora !== undefined) {
    if (body.data_ora === null || body.data_ora === '') updates.data_ora = null;
    else if (Number.isNaN(new Date(body.data_ora).getTime())) return NextResponse.json({ ok: false, error: 'data_ora non valida' }, { status: 400 });
    else updates.data_ora = new Date(body.data_ora).toISOString();
  }
  if (body.durata_minuti !== undefined) {
    if (body.durata_minuti === null) updates.durata_minuti = null;
    else if (!Number.isInteger(body.durata_minuti) || body.durata_minuti <= 0) return NextResponse.json({ ok: false, error: 'durata_minuti non valida' }, { status: 400 });
    else updates.durata_minuti = body.durata_minuti;
  }
  if (body.vcs_meeting_id !== undefined) {
    if (cur.modalita !== 'vcs') return NextResponse.json({ ok: false, error: 'la riunione vale solo per i webinar' }, { status: 400 });
    updates.vcs_meeting_id = body.vcs_meeting_id?.trim() || null;
  }
  if (body.incarico_id !== undefined) {
    if (body.incarico_id === null || body.incarico_id === '') {
      updates.incarico_id = null;
    } else {
      // Deve essere un incarico didattico della stessa edizione (il trigger D30 lo rifiuta comunque).
      const { data: inc } = await supabase.from('incarico').select('id, edizione_id').eq('id', body.incarico_id).maybeSingle();
      if (!inc || inc.edizione_id !== cur.edizione_id) return NextResponse.json({ ok: false, error: 'incarico non valido per questa edizione' }, { status: 400 });
      updates.incarico_id = inc.id;
    }
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ ok: false, error: 'nessun campo da aggiornare' }, { status: 400 });

  const { data, error } = await supabase
    .from('sessione')
    .update(updates)
    .eq('id', cur.id)
    .select('id, edizione_id, titolo, data_ora, durata_minuti, modalita, vcs_piattaforma, vcs_meeting_id, incarico_id, annullato_at')
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'sessione.updated',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'sessione',
    subjectId: data.id,
    payload: { edizione_id: data.edizione_id, titolo: data.titolo, updates: Object.keys(updates), incarico_id: data.incarico_id },
  });

  return NextResponse.json({ ok: true, sessione: data });
}
