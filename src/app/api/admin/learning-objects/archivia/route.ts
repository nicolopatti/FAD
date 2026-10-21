import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';

type Body = { ids?: unknown; ripristina?: boolean };

/**
 * Archivia (o ripristina) più contenuti della libreria. Come per il singolo:
 * soft-archive, i corsi che già li usano continuano a funzionare, non si
 * aggiungono a corsi nuovi. Un Evento per contenuto, esito fatti/saltati.
 */
export async function POST(request: Request) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as Body | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : [];
  if (!ids.length) return NextResponse.json({ ok: false, error: 'ids mancante' }, { status: 400 });
  if (ids.length > 200) return NextResponse.json({ ok: false, error: 'al massimo 200 contenuti per volta' }, { status: 400 });
  const ripristina = body?.ripristina === true;

  const supabase = await createSupabaseServerClient();
  const { data: righe, error } = await supabase.from('learning_object').select('id, titolo, archiviato_at').in('id', ids);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  const fatti: string[] = [];
  const saltati: { id: string; titolo: string; motivo: string }[] = [];
  for (const r of righe ?? []) {
    if (ripristina ? !r.archiviato_at : r.archiviato_at) {
      saltati.push({ id: r.id, titolo: r.titolo, motivo: ripristina ? 'non è archiviato' : 'già archiviato' });
      continue;
    }
    const { error: upErr } = await supabase.from('learning_object').update({ archiviato_at: ripristina ? null : new Date().toISOString() }).eq('id', r.id);
    if (upErr) { saltati.push({ id: r.id, titolo: r.titolo, motivo: upErr.message }); continue; }
    await appendEvent({
      tenantId: session.tenantId,
      eventType: ripristina ? 'learning_object.unarchived' : 'learning_object.archived',
      actor: { persona_id: session.personaId, type: 'persona' },
      subjectType: 'learning_object',
      subjectId: r.id,
      payload: { titolo: r.titolo },
    });
    fatti.push(r.id);
  }
  for (const id of ids) if (!(righe ?? []).some((r) => r.id === id)) saltati.push({ id, titolo: '', motivo: 'contenuto non trovato' });
  return NextResponse.json({ ok: true, fatti, saltati });
}
