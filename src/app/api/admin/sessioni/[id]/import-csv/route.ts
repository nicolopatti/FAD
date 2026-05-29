import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { csvToNormalizedRows, CsvAdapterError, type ColumnMapping } from '@/lib/csv';
import { ingestGrezzo } from '@/lib/pipeline';

type ImportBody = { csv?: string; mapping?: ColumnMapping };

// Adattatore CSV (Fase 3 Task 3). Riceve il testo CSV + mappatura colonne
// opzionale, lo normalizza e lo passa alla pipeline (Task 2) con fonte='csv' e
// importato_da = Persona admin. Errore ESPLICITO se manca una colonna chiave,
// PRIMA di toccare il grezzo (la write avviene solo dentro pipeline_ingest_grezzo).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as ImportBody | null;
  if (!body || typeof body.csv !== 'string' || !body.csv.trim()) {
    return NextResponse.json({ ok: false, error: 'CSV mancante' }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  // La sessione deve esistere ed essere del tenant (RLS la nasconde altrimenti).
  const { data: sessione } = await supabase
    .from('sessione')
    .select('id, annullato_at')
    .eq('id', params.id)
    .maybeSingle();
  if (!sessione) return NextResponse.json({ ok: false, error: 'sessione non trovata' }, { status: 404 });

  // Adattatore: parsing + mappatura. Gli errori sono espliciti per l'admin.
  let normalized;
  try {
    normalized = csvToNormalizedRows(body.csv, body.mapping);
  } catch (err) {
    if (err instanceof CsvAdapterError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: 'CSV non interpretabile' }, { status: 400 });
  }

  // Pipeline unica: scrive grezzo write-once + Evento report_grezzo_importato.
  try {
    const result = await ingestGrezzo(supabase, {
      tenantId: session.tenantId,
      sessioneId: params.id,
      fonte: 'csv',
      contenuto: normalized.rows,
      importatoDa: session.personaId,
    });
    return NextResponse.json({
      ok: true,
      result,
      headers: normalized.headers,
      annullata: Boolean(sessione.annullato_at),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
