import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth-context';

/**
 * Unisce questa azienda (doppione) in un'altra: le iscrizioni passano
 * all'azienda di destinazione, i campi vuoti si completano, il doppione
 * sparisce. Tutto nella RPC `azienda_unisci` (SECURITY DEFINER, verifica che
 * il chiamante sia admin del tenant) con l'Evento `azienda.unita`.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  const body = (await request.json().catch(() => null)) as { in?: unknown } | null;
  const destinazione = typeof body?.in === 'string' ? body.in : '';
  if (!destinazione) return NextResponse.json({ ok: false, error: 'azienda di destinazione mancante' }, { status: 400 });
  if (destinazione === params.id) return NextResponse.json({ ok: false, error: 'le due aziende coincidono' }, { status: 400 });

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('azienda_unisci', { p_da: params.id, p_a: destinazione, p_attore: session.personaId });
  if (error) return NextResponse.json({ ok: false, error: error.message.replace(/^azienda_unisci: /, '') }, { status: 400 });
  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
}
