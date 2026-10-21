import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';

type CreateBody = {
  titolo?: string;
  codice?: string | null;
  fondo?: string | null;
  cup?: string | null;
  avviso?: string | null;
  canale?: string | null;
};

const FONDI = ['fondimpresa', 'foncoop'];

// Creazione di un Piano formativo finanziato (testata: titolo, codice, fondo,
// CUP, avviso, canale). Nessun dato contabile (D32). RLS: `piano_insert_admin`.
export async function POST(request: Request) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as CreateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });

  const titolo = body.titolo?.trim();
  if (!titolo) return NextResponse.json({ ok: false, error: 'titolo mancante' }, { status: 400 });
  const fondo = body.fondo?.trim().toLowerCase() || null;
  if (fondo && !FONDI.includes(fondo)) {
    return NextResponse.json({ ok: false, error: `fondo non riconosciuto (${FONDI.join(', ')})` }, { status: 400 });
  }
  const opt = (v: string | null | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('piano_formativo_finanziato')
    .insert({
      tenant_id: session.tenantId,
      titolo,
      codice: opt(body.codice),
      fondo,
      cup: opt(body.cup)?.toUpperCase() ?? null,
      avviso: opt(body.avviso),
      canale: opt(body.canale),
    })
    .select('id, titolo, codice, fondo, cup, avviso, canale')
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'piano.created',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'piano_formativo_finanziato',
    subjectId: data.id,
    payload: { titolo: data.titolo, fondo: data.fondo, ha_cup: data.cup !== null },
  });

  return NextResponse.json({ ok: true, piano: data });
}
