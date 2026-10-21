import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';
import { contenutoEsempio, generaAttestatoPdf } from '@/lib/attestato-pdf';
import { immaginiPer } from '@/lib/attestato-serve';
import { datiEnteDa, ENTE_SELECT, normalizzaParziale, risolviModello, type EnteTenantRow } from '@/lib/attestato-modello';
import type { AttestatoContenuto } from '@/lib/attestati';

export const dynamic = 'force-dynamic';

type Body = { modello?: unknown; corso_id?: string | null; ambito?: 'ente' | 'corso' };

// Anteprima PDF del modello in bozza (nessuna scrittura): dati d'esempio del
// discente, dati reali di ente e corso. Per il corso, il modello in bozza si
// sovrappone a quello dell'ente come farà l'emissione.
export async function POST(request: Request) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => ({}))) as Body;
  const supabase = await createSupabaseServerClient();
  const { data: t } = await supabase.from('tenant').select(ENTE_SELECT).eq('id', session.tenantId).maybeSingle<EnteTenantRow>();
  if (!t) return NextResponse.json({ ok: false }, { status: 404 });
  const ente: AttestatoContenuto['ente'] = datiEnteDa(t);
  const bozza = normalizzaParziale(body.modello);
  let corso: AttestatoContenuto['corso'] | undefined;
  if (body.corso_id) {
    const { data: c } = await supabase.from('corso').select('id, titolo, categoria, ore_totali, riferimento_normativo').eq('id', body.corso_id).maybeSingle<{ id: string; titolo: string; categoria: string | null; ore_totali: number | string | null; riferimento_normativo: string | null }>();
    if (c) corso = { id: c.id, titolo: c.titolo, categoria: c.categoria, ore_totali: c.ore_totali != null ? Number(c.ore_totali) : null, riferimento_normativo: c.riferimento_normativo };
  }
  const modello = body.ambito === 'corso'
    ? risolviModello(ente, t.attestato_modello ?? null, bozza)
    : risolviModello(ente, bozza, null);
  const contenuto = contenutoEsempio({ ente, corso }, modello);
  const bytes = await generaAttestatoPdf(contenuto, await immaginiPer(contenuto));
  return new Response(Buffer.from(bytes), { headers: { 'content-type': 'application/pdf', 'content-disposition': 'inline; filename="anteprima-attestato.pdf"', 'cache-control': 'no-store' } });
}
