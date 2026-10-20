import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { rispostaPdf } from '@/lib/attestato-serve';
import type { AttestatoRow } from '@/lib/db-types';

export const dynamic = 'force-dynamic';

// PDF dell'attestato. Autorizzazione via RLS: la riga è leggibile solo dal
// titolare e dallo staff del tenant (policy attestato_read_*).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { data: att } = await supabase.from('attestato').select('*').eq('id', params.id).maybeSingle<AttestatoRow>();
  if (!att) return NextResponse.json({ ok: false, error: 'attestato non trovato' }, { status: 404 });
  return rispostaPdf(att);
}
