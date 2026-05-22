import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';

type ReorderBody = {
  ordered_struttura_ids?: string[];
};

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as ReorderBody | null;
  if (!body || !Array.isArray(body.ordered_struttura_ids)) {
    return NextResponse.json({ ok: false, error: 'ordered_struttura_ids mancante' }, { status: 400 });
  }
  if (!body.ordered_struttura_ids.every((s) => typeof s === 'string' && s.length > 0)) {
    return NextResponse.json({ ok: false, error: 'array non valido' }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc('reorder_struttura', {
    p_corso_id: params.id,
    p_ordered_struttura_ids: body.ordered_struttura_ids,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await appendEvent(supabase, {
    tenantId: session.tenantId,
    eventType: 'struttura.reordered',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'corso',
    subjectId: params.id,
    payload: {
      ordered_struttura_ids: body.ordered_struttura_ids,
    },
  });

  return NextResponse.json({ ok: true });
}
