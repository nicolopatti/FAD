import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { getAdapter } from '@/lib/report-fondo-formati';
import type { ReportFondoDataset } from '@/lib/report-fondo';

// Fase 4 — Task 6: scarica il file di uno snapshot DEPOSITATO. Rigenera il file
// dal `contenuto` CONGELATO dello snapshot (non dai dati live): riflette
// l'anagrafica al momento del deposito (D18). Read-only, nessun Evento.
export async function GET(request: Request) {
  await requireAdmin();
  const url = new URL(request.url);
  const snapshotId = url.searchParams.get('snapshot');
  if (!snapshotId) {
    return NextResponse.json({ ok: false, error: 'snapshot mancante' }, { status: 400 });
  }
  const supabase = createSupabaseServerClient();
  const { data: snap } = await supabase
    .from('report_fondo_depositato')
    .select('formato, contenuto')
    .eq('id', snapshotId)
    .maybeSingle();
  if (!snap) {
    return NextResponse.json({ ok: false, error: 'snapshot non trovato' }, { status: 404 });
  }
  const adapter = getAdapter(snap.formato as string);
  if (!adapter) {
    return NextResponse.json({ ok: false, error: `formato sconosciuto: ${snap.formato}` }, { status: 400 });
  }
  const file = adapter.genera(snap.contenuto as ReportFondoDataset);
  return new NextResponse(file.contenuto, {
    status: 200,
    headers: {
      'Content-Type': file.mime,
      'Content-Disposition': `attachment; filename="snapshot_${file.filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
