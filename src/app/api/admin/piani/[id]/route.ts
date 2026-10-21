import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';

type UpdateBody = {
  titolo?: string;
  codice?: string | null;
  fondo?: string | null;
  cup?: string | null;
  avviso?: string | null;
  canale?: string | null;
};

const FONDI = ['fondimpresa', 'foncoop'];
const CAMPI = ['titolo', 'codice', 'fondo', 'cup', 'avviso', 'canale'] as const;

// Modifica della testata di un Piano finanziato (stessi campi della creazione).
// I report già depositati non cambiano: sono snapshot write-once. RLS:
// `piano_update_admin`. L'Evento porta i nomi dei campi cambiati, non i valori.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });

  const opt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const updates: Record<string, string | null> = {};
  if (body.titolo !== undefined) {
    const t = opt(body.titolo);
    if (!t) return NextResponse.json({ ok: false, error: 'titolo mancante' }, { status: 400 });
    updates.titolo = t;
  }
  if (body.codice !== undefined) updates.codice = opt(body.codice);
  if (body.fondo !== undefined) {
    const f = opt(body.fondo)?.toLowerCase() ?? null;
    if (f && !FONDI.includes(f)) return NextResponse.json({ ok: false, error: `fondo non riconosciuto (${FONDI.join(', ')})` }, { status: 400 });
    updates.fondo = f;
  }
  if (body.cup !== undefined) {
    const c = opt(body.cup)?.toUpperCase() ?? null;
    if (c && !/^[A-Z0-9]{15}$/.test(c)) return NextResponse.json({ ok: false, error: 'Il CUP è un codice di 15 caratteri alfanumerici.' }, { status: 400 });
    updates.cup = c;
  }
  if (body.avviso !== undefined) updates.avviso = opt(body.avviso);
  if (body.canale !== undefined) updates.canale = opt(body.canale);
  if (Object.keys(updates).length === 0) return NextResponse.json({ ok: false, error: 'nessun campo da aggiornare' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('piano_formativo_finanziato')
    .update(updates)
    .eq('id', params.id)
    .select('id, titolo, codice, fondo, cup, avviso, canale')
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ ok: false, error: 'Piano non trovato.' }, { status: 404 });

  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'piano.updated',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'piano_formativo_finanziato',
    subjectId: data.id,
    payload: { campi: CAMPI.filter((k) => k in updates), ha_cup: data.cup !== null },
  });

  return NextResponse.json({ ok: true, piano: data });
}

// Elimina un piano non usato: niente iscrizioni collegate né report depositati
// (409 altrimenti: i report sono prove write-once e lo tengono legato). RLS:
// `piano_delete_admin`. Evento `piano.removed` con il solo titolo.
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: piano } = await supabase.from('piano_formativo_finanziato').select('id, titolo').eq('id', params.id).maybeSingle();
  if (!piano) return NextResponse.json({ ok: false, error: 'Piano non trovato.' }, { status: 404 });

  const [{ count: nIscr }, { count: nDep }] = await Promise.all([
    supabase.from('iscrizione').select('id', { count: 'exact', head: true }).eq('piano_id', piano.id),
    supabase.from('report_fondo_depositato').select('id', { count: 'exact', head: true }).eq('piano_id', piano.id),
  ]);
  if ((nIscr ?? 0) > 0) return NextResponse.json({ ok: false, error: `Il piano è assegnato a ${nIscr} iscritt${nIscr === 1 ? 'o' : 'i'}: toglilo prima dalla scheda Fondo delle edizioni.` }, { status: 409 });
  if ((nDep ?? 0) > 0) return NextResponse.json({ ok: false, error: 'Per questo piano ci sono report depositati: resta come prova.' }, { status: 409 });

  const { error } = await supabase.from('piano_formativo_finanziato').delete().eq('id', piano.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'piano.removed',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'piano_formativo_finanziato',
    subjectId: piano.id,
    payload: { titolo: piano.titolo },
  });
  return NextResponse.json({ ok: true });
}
