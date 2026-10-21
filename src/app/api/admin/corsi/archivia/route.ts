import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';

type Body = { corso_ids?: string[]; ripristina?: boolean };
type CorsoMini = { id: string; titolo: string; archiviato_at: string | null; n_edizioni_attive: number };

/**
 * Archivia (o ripristina) uno o più corsi. Un corso si archivia solo senza
 * edizioni attive: sparisce dal catalogo predefinito, dalla dashboard e dai
 * selettori, ma resta leggibile (le sue edizioni concluse, gli attestati e il
 * registro non cambiano). Non è un campo strutturale: vale anche a corso
 * congelato. Un Evento per corso: `corso.archived` / `corso.unarchived`.
 */
export async function POST(request: Request) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as Body | null;
  const ids = Array.isArray(body?.corso_ids) ? body!.corso_ids.filter((x) => typeof x === 'string') : [];
  if (!ids.length) return NextResponse.json({ ok: false, error: 'corso_ids mancante' }, { status: 400 });
  if (ids.length > 200) return NextResponse.json({ ok: false, error: 'al massimo 200 corsi per volta' }, { status: 400 });
  const ripristina = body?.ripristina === true;

  const supabase = await createSupabaseServerClient();
  const { data: corsi, error } = await supabase
    .from('corso_riepilogo')
    .select('id, titolo, archiviato_at, n_edizioni_attive')
    .in('id', ids)
    .returns<CorsoMini[]>();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  const fatti: string[] = [];
  const saltati: { id: string; titolo: string; motivo: string }[] = [];
  for (const c of corsi ?? []) {
    if (ripristina) {
      if (!c.archiviato_at) { saltati.push({ id: c.id, titolo: c.titolo, motivo: 'non è archiviato' }); continue; }
    } else {
      if (c.archiviato_at) { saltati.push({ id: c.id, titolo: c.titolo, motivo: 'già archiviato' }); continue; }
      if (c.n_edizioni_attive > 0) { saltati.push({ id: c.id, titolo: c.titolo, motivo: `ha ${c.n_edizioni_attive} ${c.n_edizioni_attive === 1 ? 'edizione attiva' : 'edizioni attive'}` }); continue; }
    }
    const { error: upErr } = await supabase.from('corso').update({ archiviato_at: ripristina ? null : new Date().toISOString() }).eq('id', c.id);
    if (upErr) { saltati.push({ id: c.id, titolo: c.titolo, motivo: upErr.message }); continue; }
    await appendEvent({
      tenantId: session.tenantId,
      eventType: ripristina ? 'corso.unarchived' : 'corso.archived',
      actor: { persona_id: session.personaId, type: 'persona' },
      subjectType: 'corso',
      subjectId: c.id,
      payload: { titolo: c.titolo },
    });
    fatti.push(c.id);
  }
  for (const id of ids) if (!(corsi ?? []).some((c) => c.id === id)) saltati.push({ id, titolo: '', motivo: 'corso non trovato' });

  return NextResponse.json({ ok: true, fatti, saltati });
}
