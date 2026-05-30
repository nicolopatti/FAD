import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { computeReportFondoDataset, depositaReportFondo } from '@/lib/report-fondo';
import { validateReportFondo, hasBloccanti } from '@/lib/report-fondo-validazioni';
import { getAdapter } from '@/lib/report-fondo-formati';

type Body = { edizione?: string; piano?: string; formato?: string; override?: boolean };

// Fase 4 — Task 6: deposito definitivo. Ricalcola il dataset ADESSO (D8), valida,
// e — se non ci sono warning bloccanti non confermati — crea lo snapshot
// write-once + l'Evento (via la RPC SECURITY DEFINER). I warning bloccanti
// richiedono override esplicito (policy §10, decisione utente).
export async function POST(request: Request) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body?.edizione || !body?.piano) {
    return NextResponse.json({ ok: false, error: 'edizione/piano mancanti' }, { status: 400 });
  }
  const formato = body.formato ?? 'fondimpresa';
  if (!getAdapter(formato)) {
    return NextResponse.json({ ok: false, error: `formato sconosciuto: ${formato}` }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const dataset = await computeReportFondoDataset(supabase, body.edizione, body.piano);
  if (!dataset) {
    return NextResponse.json({ ok: false, error: 'edizione/piano non leggibili (RLS o inesistenti)' }, { status: 404 });
  }

  const warnings = validateReportFondo(dataset);
  if (hasBloccanti(warnings) && !body.override) {
    return NextResponse.json(
      { ok: false, error: 'Sono presenti warning bloccanti: conferma per depositare comunque.', bloccanti: true, warnings },
      { status: 409 },
    );
  }

  try {
    const result = await depositaReportFondo(supabase, {
      edizioneId: body.edizione,
      pianoId: body.piano,
      formato,
      contenuto: dataset,
      generatoDa: session.personaId,
    });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
