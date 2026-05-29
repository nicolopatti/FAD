import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';
import type { SessioneModalita, VcsPiattaforma } from '@/lib/db-types';

type CreateBody = {
  edizione_id?: string;
  titolo?: string;
  data_ora?: string | null;
  durata_minuti?: number | null;
  modalita?: SessioneModalita;
  vcs_piattaforma?: VcsPiattaforma | null;
  vcs_meeting_id?: string | null;
};

// Pianificazione di una Sessione VCS/aula dentro un'Edizione (D30). L'assegnazione
// del docente (`incarico_id`) è opzionale e si fa dopo: una Sessione con
// incarico_id NULL è pianificabile (M3 #6). RLS: solo admin del tenant.
export async function POST(request: Request) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as CreateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });

  const titolo = body.titolo?.trim();
  if (!titolo) return NextResponse.json({ ok: false, error: 'titolo mancante' }, { status: 400 });
  if (!body.edizione_id) return NextResponse.json({ ok: false, error: 'edizione_id mancante' }, { status: 400 });
  if (body.modalita !== 'aula' && body.modalita !== 'vcs') {
    return NextResponse.json({ ok: false, error: "modalita deve essere 'aula' o 'vcs'" }, { status: 400 });
  }
  if (body.modalita === 'vcs' && body.vcs_piattaforma !== 'teams' && body.vcs_piattaforma !== 'zoom') {
    return NextResponse.json({ ok: false, error: 'per una sessione VCS serve vcs_piattaforma (teams/zoom)' }, { status: 400 });
  }
  if (body.durata_minuti != null && (!Number.isInteger(body.durata_minuti) || body.durata_minuti < 0)) {
    return NextResponse.json({ ok: false, error: 'durata_minuti non valida' }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  // L'edizione deve esistere ed essere del tenant (RLS la nasconde altrimenti).
  const { data: edizione } = await supabase
    .from('edizione')
    .select('id')
    .eq('id', body.edizione_id)
    .maybeSingle();
  if (!edizione) return NextResponse.json({ ok: false, error: 'edizione non trovata' }, { status: 404 });

  const insert: Record<string, unknown> = {
    tenant_id: session.tenantId,
    edizione_id: body.edizione_id,
    titolo,
    modalita: body.modalita,
    data_ora: body.data_ora || null,
    durata_minuti: body.durata_minuti ?? null,
    vcs_piattaforma: body.modalita === 'vcs' ? body.vcs_piattaforma : null,
    vcs_meeting_id: body.modalita === 'vcs' ? (body.vcs_meeting_id?.trim() || null) : null,
  };

  const { data, error } = await supabase
    .from('sessione')
    .insert(insert)
    .select('id, edizione_id, titolo, data_ora, durata_minuti, modalita, vcs_piattaforma, vcs_meeting_id, incarico_id, annullato_at, creato_il')
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  // Evento di audit (no PII: titolo della sessione e meeting id non sono PII).
  await appendEvent(supabase, {
    tenantId: session.tenantId,
    eventType: 'sessione.created',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'sessione',
    subjectId: data.id,
    payload: {
      edizione_id: data.edizione_id,
      modalita: data.modalita,
      vcs_piattaforma: data.vcs_piattaforma,
      vcs_meeting_id: data.vcs_meeting_id,
    },
  });

  return NextResponse.json({ ok: true, sessione: data });
}
