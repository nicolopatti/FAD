import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';
import { parseSoglia } from '@/lib/validazione';

type CreateBody = {
  titolo?: string;
  descrizione?: string | null;
  sblocco_sequenziale?: boolean;
  visione_integrale?: boolean;
  categoria?: string | null;
  ore_totali?: number | string | null;
  riferimento_normativo?: string | null;
  politica_attestato?: string;
  soglia_frequenza_percentuale?: number | string | null;
};

const POLITICHE = new Set(['automatica', 'manuale', 'nessuna']);

export async function POST(request: Request) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as CreateBody | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });

  const titolo = body.titolo?.trim();
  if (!titolo) {
    return NextResponse.json({ ok: false, error: 'titolo mancante' }, { status: 400 });
  }
  const ore = body.ore_totali == null || body.ore_totali === '' ? null : Number(String(body.ore_totali).replace(',', '.'));
  if (ore != null && (!Number.isFinite(ore) || ore <= 0 || ore > 9999)) {
    return NextResponse.json({ ok: false, error: 'ore totali non valide' }, { status: 400 });
  }
  const soglia = parseSoglia(body.soglia_frequenza_percentuale);
  if (soglia === undefined) return NextResponse.json({ ok: false, error: 'soglia di frequenza non valida (tra 1 e 100)' }, { status: 400 });
  const politica = body.politica_attestato ?? 'manuale'; // R1 (D10): rilascio con approvazione umana di default
  if (!POLITICHE.has(politica)) return NextResponse.json({ ok: false, error: 'politica attestato non valida' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('corso')
    .insert({
      tenant_id: session.tenantId,
      titolo,
      ore_totali: ore,
      riferimento_normativo: body.riferimento_normativo?.trim() || null,
      politica_attestato: politica,
      descrizione: body.descrizione?.trim() || null,
      sblocco_sequenziale: body.sblocco_sequenziale ?? true,
      visione_integrale: body.visione_integrale === true,
      categoria: body.categoria?.trim() || null,
      soglia_frequenza_percentuale: soglia,
    })
    .select('id, titolo, descrizione, sblocco_sequenziale, visione_integrale, categoria, cover_path, ore_totali, riferimento_normativo, politica_attestato, soglia_frequenza_percentuale, creato_il')
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await appendEvent({
    tenantId: session.tenantId,
    eventType: 'corso.created',
    actor: { persona_id: session.personaId, type: 'persona' },
    subjectType: 'corso',
    subjectId: data.id,
    payload: { titolo: data.titolo, sblocco_sequenziale: data.sblocco_sequenziale, visione_integrale: data.visione_integrale },
  });

  return NextResponse.json({ ok: true, corso: data });
}
