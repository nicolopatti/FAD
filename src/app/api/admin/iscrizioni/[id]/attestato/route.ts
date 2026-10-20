import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { emettiAttestatoManuale } from '@/lib/attestati';
import type { AttestatoRow } from '@/lib/db-types';

// Emissione manuale dell'attestato (politica `manuale`, o riemissione con
// motivazione quando ne esiste già uno valido: il precedente viene marcato
// sostituito, mai modificato). Richiede l'idoneità ricalcolata adesso.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => ({}))) as { motivazione?: string | null };
  const supabase = createSupabaseServerClient();
  const { data: iscr } = await supabase.from('iscrizione').select('id').eq('id', params.id).maybeSingle();
  if (!iscr) return NextResponse.json({ ok: false, error: 'iscrizione non trovata' }, { status: 404 });
  const { data: valido } = await supabase.from('attestato').select('id, numero').eq('iscrizione_id', params.id).is('sostituito_da', null).maybeSingle<Pick<AttestatoRow, 'id' | 'numero'>>();
  const motivazione = body.motivazione?.trim() || null;
  if (valido && !motivazione) {
    return NextResponse.json({ ok: false, error: `Esiste già l'attestato n. ${valido.numero}: per riemetterlo indica la motivazione.` }, { status: 409 });
  }
  try {
    const esito = await emettiAttestatoManuale(params.id, session.personaId, { sostituisce: valido?.id ?? null, motivazione });
    return NextResponse.json({ ok: true, attestato: esito, sostituito: valido?.numero ?? null });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
