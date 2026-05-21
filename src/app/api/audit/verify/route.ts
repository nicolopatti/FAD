import { NextResponse } from 'next/server';
import { requireAuditor } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  await requireAuditor();
  const url = new URL(request.url);
  const streamId = url.searchParams.get('stream_id');
  if (!streamId) {
    return NextResponse.json({ ok: false, error: 'stream_id mancante' }, { status: 400 });
  }
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('audit_verify_chain', { p_stream_id: streamId });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const rows = (data as Array<{ seq: number; problema: string }>) ?? [];
  if (rows.length === 0) return NextResponse.json({ ok: true });
  return NextResponse.json({ ok: false, problemi: rows });
}
