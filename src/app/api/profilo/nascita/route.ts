import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/auth-context';

// Il discente completa data e luogo di nascita (servono sull'attestato).
// Passa per la RPC `persona_aggiorna_nascita`, che tocca solo quei due campi
// della propria Persona: nessuna policy UPDATE generica su `persona`.
export async function POST(request: Request) {
  await requireSession();
  const body = (await request.json().catch(() => null)) as { data_nascita?: string | null; luogo_nascita?: string | null } | null;
  if (!body) return NextResponse.json({ ok: false, error: 'body mancante' }, { status: 400 });
  const data = body.data_nascita?.trim() || null;
  if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) return NextResponse.json({ ok: false, error: 'data non valida' }, { status: 400 });
  const luogo = body.luogo_nascita?.trim() || null;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('persona_aggiorna_nascita', { p_data_nascita: data, p_luogo_nascita: luogo });
  if (error) return NextResponse.json({ ok: false, error: error.message.replace(/^persona_aggiorna_nascita: /, '') }, { status: 400 });
  return NextResponse.json({ ok: true });
}
