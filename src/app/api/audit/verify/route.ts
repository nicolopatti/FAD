import { NextResponse } from 'next/server';
import { requireAuditor } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { bytesToHex } from '@/lib/audit-filtri';

// Verifica della catena hash dello stream (RPC `audit_verify_chain`, sola
// lettura). Oltre all'esito restituisce quanti eventi sono stati verificati e
// l'hash di testa, così l'auditor può annotare il "sigillo" del momento.
export async function GET(request: Request) {
  await requireAuditor();
  const url = new URL(request.url);
  const streamId = url.searchParams.get('stream_id');
  if (!streamId) {
    return NextResponse.json({ ok: false, error: 'stream_id mancante' }, { status: 400 });
  }
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { count }, { data: testa }] = await Promise.all([
    supabase.rpc('audit_verify_chain', { p_stream_id: streamId }),
    supabase.from('evento').select('id', { count: 'exact', head: true }).eq('stream_id', streamId),
    supabase.from('evento').select('seq, hash, occurred_at').eq('stream_id', streamId).order('seq', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const rows = (data as Array<{ seq: number; problema: string }>) ?? [];
  const base = {
    eventi: count ?? 0,
    testa: testa ? { seq: testa.seq as number, hash: bytesToHex(testa.hash), occurred_at: testa.occurred_at as string } : null,
    verificato_il: new Date().toISOString(),
  };
  if (rows.length === 0) return NextResponse.json({ ok: true, ...base });
  return NextResponse.json({ ok: false, problemi: rows, ...base });
}
