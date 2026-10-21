import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { addIscritto, motivoEdizioneChiusa, type IscrittoInput } from '@/lib/iscritti';

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as IscrittoInput | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const chiusa = await motivoEdizioneChiusa(supabase, params.id);
  if (chiusa) return NextResponse.json({ ok: false, error: chiusa.error }, { status: chiusa.status });
  const res = await addIscritto(supabase, { tenantId: session.tenantId, personaId: session.personaId }, params.id, body);

  if (res.status === 'error') return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
  if (res.status === 'duplicate') return NextResponse.json({ ok: false, error: `${res.persona.nome} ${res.persona.cognome} risulta già tra gli iscritti di questa edizione.` }, { status: 409 });
  // A4: email di una persona esistente con dati diversi → serve la conferma dell'admin.
  if (res.status === 'conflict') return NextResponse.json({ ok: false, error: res.error, conflitto: { persona: res.persona, motivi: res.motivi } }, { status: 409 });
  return NextResponse.json({ ok: true, iscrizione_id: res.iscrizione_id, persona: res.persona, persona_creata: res.persona_creata });
}
