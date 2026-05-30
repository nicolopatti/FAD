import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { computeReportFondoDataset } from '@/lib/report-fondo';
import { getAdapter } from '@/lib/report-fondo-formati';

// Fase 4 — Task 4: genera e scarica il FILE del report fondo per (Edizione,
// Piano) + formato. Il motore gira sotto la sessione admin (RLS, M4a #6). NON
// scrive alcun Evento (M4a #3): la generazione è una vista calcolata adesso; il
// deposito write-once (con Evento+hash) è un'azione separata (Task 6).
export async function GET(request: Request) {
  await requireAdmin();
  const url = new URL(request.url);
  const edizione = url.searchParams.get('edizione');
  const piano = url.searchParams.get('piano');
  const formato = url.searchParams.get('formato') ?? 'fondimpresa';

  if (!edizione || !piano) {
    return NextResponse.json({ ok: false, error: 'edizione/piano mancanti' }, { status: 400 });
  }
  const adapter = getAdapter(formato);
  if (!adapter) {
    return NextResponse.json({ ok: false, error: `formato sconosciuto: ${formato}` }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const dataset = await computeReportFondoDataset(supabase, edizione, piano);
  if (!dataset) {
    return NextResponse.json({ ok: false, error: 'edizione/piano non leggibili (RLS o inesistenti)' }, { status: 404 });
  }

  const file = adapter.genera(dataset);
  return new NextResponse(file.contenuto, {
    status: 200,
    headers: {
      'Content-Type': file.mime,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
