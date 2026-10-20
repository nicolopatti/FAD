import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { badgeResponse } from '@/lib/attestato-badge';
import type { AttestatoRow } from '@/lib/db-types';

export const dynamic = 'force-dynamic';

// Badge PNG (?formato=post per 1200×630). Autorizzazione via RLS come il PDF.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { data: att } = await supabase.from('attestato').select('*').eq('id', params.id).maybeSingle<AttestatoRow>();
  if (!att) return NextResponse.json({ ok: false, error: 'attestato non trovato' }, { status: 404 });
  const formato = new URL(request.url).searchParams.get('formato') === 'post' ? 'post' : 'quadrato';
  return badgeResponse(att, formato);
}
