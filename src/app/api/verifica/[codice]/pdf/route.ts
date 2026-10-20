import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { rispostaPdf } from '@/lib/attestato-serve';
import type { AttestatoRow } from '@/lib/db-types';

export const dynamic = 'force-dynamic';

// PDF pubblico: chi conosce il codice di verifica (24 caratteri casuali, non
// enumerabile) può scaricare il documento, come dalla pagina /verifica.
export async function GET(_request: Request, { params }: { params: { codice: string } }) {
  const codice = params.codice.toLowerCase();
  if (!/^[0-9a-f]{24}$/.test(codice)) return NextResponse.json({ ok: false }, { status: 404 });
  let service;
  try { service = createSupabaseServiceClient(); } catch { return NextResponse.json({ ok: false, error: 'servizio non disponibile' }, { status: 503 }); }
  const { data: att } = await service.from('attestato').select('*').eq('codice_verifica', codice).maybeSingle<AttestatoRow>();
  if (!att) return NextResponse.json({ ok: false, error: 'attestato non trovato' }, { status: 404 });
  return rispostaPdf(att);
}
