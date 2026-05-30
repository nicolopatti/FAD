import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';

// Fase 4 — Task 6: verifica d'integrità di uno snapshot depositato. Ricalcola
// l'hash del contenuto memorizzato e lo confronta con quello attestato
// nell'Evento di deposito (RPC report_fondo_verifica, SECURITY DEFINER).
export async function GET(request: Request) {
  await requireAdmin();
  const url = new URL(request.url);
  const snapshot = url.searchParams.get('snapshot');
  if (!snapshot) {
    return NextResponse.json({ ok: false, error: 'snapshot mancante' }, { status: 400 });
  }
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('report_fondo_verifica', { p_snapshot_id: snapshot });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
}
