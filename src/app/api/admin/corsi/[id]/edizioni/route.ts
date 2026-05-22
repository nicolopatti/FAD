import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';

type CreateBody = {
  codice?: string;
  data_inizio?: string | null;
  data_fine?: string | null;
  fad_apertura?: string | null;
  fad_chiusura?: string | null;
};

function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as CreateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });

  const codice = body.codice?.trim();
  if (!codice) return NextResponse.json({ ok: false, error: 'codice mancante' }, { status: 400 });

  const payload: Record<string, unknown> = {
    tenant_id: session.tenantId,
    corso_id: params.id,
    codice,
  };
  for (const k of ['data_inizio', 'data_fine', 'fad_apertura', 'fad_chiusura'] as const) {
    const v = body[k];
    if (v === undefined || v === null || v === '') continue;
    if (!isIsoDate(v)) return NextResponse.json({ ok: false, error: `${k} non è una data ISO YYYY-MM-DD` }, { status: 400 });
    payload[k] = v;
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('edizione')
    .insert(payload)
    .select('id, codice, data_inizio, data_fine, fad_apertura, fad_chiusura, concluso_at, annullato_at, creato_il')
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await appendEvent(supabase, {
    tenantId: session.tenantId,
    eventType: 'edizione.created',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'edizione',
    subjectId: data.id,
    payload: {
      corso_id: params.id,
      codice: data.codice,
      data_inizio: data.data_inizio,
      data_fine: data.data_fine,
      fad_apertura: data.fad_apertura,
      fad_chiusura: data.fad_chiusura,
    },
  });

  return NextResponse.json({ ok: true, edizione: data });
}
