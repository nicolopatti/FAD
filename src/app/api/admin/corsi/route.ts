import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { appendEvent } from '@/lib/audit';
import { MSG_ORE, parseOre, parseSoglia } from '@/lib/validazione';

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
    return NextResponse.json({ ok: false, error: 'Il titolo è obbligatorio.' }, { status: 400 });
  }
  const ore = parseOre(body.ore_totali);
  if (ore === undefined) return NextResponse.json({ ok: false, error: MSG_ORE, campo: 'ore_totali' }, { status: 400 });
  const soglia = parseSoglia(body.soglia_frequenza_percentuale);
  if (soglia === undefined) return NextResponse.json({ ok: false, error: 'La presenza minima deve essere una percentuale tra 1 e 100.', campo: 'soglia_frequenza_percentuale' }, { status: 400 });
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
