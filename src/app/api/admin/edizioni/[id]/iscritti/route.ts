import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { addIscritto, type IscrittoInput } from '@/lib/iscritti';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as IscrittoInput | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });

  const supabase = createSupabaseServerClient();
  const res = await addIscritto(supabase, { tenantId: session.tenantId, personaId: session.personaId }, params.id, body);

  if (res.status === 'error') return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
  if (res.status === 'duplicate') return NextResponse.json({ ok: false, error: 'Persona già iscritta a questa edizione.' }, { status: 409 });
  return NextResponse.json({ ok: true, iscrizione_id: res.iscrizione_id });
}
