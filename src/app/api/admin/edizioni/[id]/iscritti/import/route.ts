import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';
import { addIscritto, type IscrittoInput } from '@/lib/iscritti';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as { rows?: IscrittoInput[] } | null;
  if (!body || !Array.isArray(body.rows)) {
    return NextResponse.json({ ok: false, error: 'rows mancante' }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const ctx = { tenantId: session.tenantId, personaId: session.personaId };

  let creati = 0;
  let duplicati = 0;
  const errori: { riga: number; error: string }[] = [];

  for (let i = 0; i < body.rows.length; i++) {
    const res = await addIscritto(supabase, ctx, params.id, body.rows[i]);
    if (res.status === 'created') creati += 1;
    else if (res.status === 'duplicate') duplicati += 1;
    else errori.push({ riga: i + 1, error: res.error });
  }

  if (creati > 0) {
    await appendEvent(supabase, {
      tenantId: session.tenantId,
      eventType: 'iscrizione.imported',
      actor: { persona_id: session.personaId, type: 'persona' },
      subjectType: 'edizione',
      subjectId: params.id,
      payload: { aggiunti: creati, duplicati, errori: errori.length },
    });
  }

  return NextResponse.json({ ok: true, creati, duplicati, errori });
}
