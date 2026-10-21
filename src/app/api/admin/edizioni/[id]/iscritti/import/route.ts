import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';
import { addIscritto, motivoEdizioneChiusa, type IscrittoInput } from '@/lib/iscritti';

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as { rows?: IscrittoInput[] } | null;
  if (!body || !Array.isArray(body.rows)) {
    return NextResponse.json({ ok: false, error: 'rows mancante' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const chiusa = await motivoEdizioneChiusa(supabase, params.id);
  if (chiusa) return NextResponse.json({ ok: false, error: chiusa.error }, { status: chiusa.status });
  const ctx = { tenantId: session.tenantId, personaId: session.personaId };

  let creati = 0;
  let duplicati = 0;
  const errori: { riga: number; error: string }[] = [];
  // A4: righe con l'email di una persona esistente ma dati diversi: segnalate, non applicate.
  const conflitti: { riga: number; error: string }[] = [];

  for (let i = 0; i < body.rows.length; i++) {
    // Dal CSV non arriva mai una conferma: ogni conflitto va risolto a mano.
    const res = await addIscritto(supabase, ctx, params.id, { ...body.rows[i], conferma_persona_id: null });
    if (res.status === 'created') creati += 1;
    else if (res.status === 'duplicate') duplicati += 1;
    else if (res.status === 'conflict') conflitti.push({ riga: i + 1, error: res.error });
    else errori.push({ riga: i + 1, error: res.error });
  }

  if (creati > 0) {
    await appendEvent({
      tenantId: session.tenantId,
      eventType: 'iscrizione.imported',
      actor: { persona_id: session.personaId, type: 'persona' },
      subjectType: 'edizione',
      subjectId: params.id,
      payload: { aggiunti: creati, duplicati, errori: errori.length, conflitti: conflitti.length },
    });
  }

  return NextResponse.json({ ok: true, creati, duplicati, errori, conflitti });
}
