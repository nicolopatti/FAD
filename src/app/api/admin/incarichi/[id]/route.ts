import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';

/** Toglie un incarico. Se una sessione lo usa come docente, prima si cambia lì. */
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: inc } = await supabase.from('incarico').select('id, edizione_id, persona_id, ruolo').eq('id', params.id).maybeSingle();
  if (!inc) return NextResponse.json({ ok: false, error: 'incarico non trovato' }, { status: 404 });

  const { count } = await supabase.from('sessione').select('id', { count: 'exact', head: true }).eq('incarico_id', inc.id);
  if ((count ?? 0) > 0) {
    return NextResponse.json({ ok: false, error: `Questa persona è il docente di ${count} session${count === 1 ? 'e' : 'i'}: cambia prima il docente di quelle sessioni.` }, { status: 409 });
  }

  const { error } = await supabase.from('incarico').delete().eq('id', inc.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'incarico.removed',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'incarico',
    subjectId: inc.id,
    payload: { edizione_id: inc.edizione_id, persona_id: inc.persona_id, ruolo: inc.ruolo },
  });

  return NextResponse.json({ ok: true });
}
