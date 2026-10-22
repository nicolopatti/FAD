import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assicuraPersona, percorsoSicuro } from '@/lib/registrazione';

// Atterraggio dei link via email (reset password, invito) quando il modello
// dell'email usa il flusso server: `?code=` (PKCE) oppure `?token_hash=&type=`
// (modelli personalizzati su Supabase → Auth → Email templates). Scambia il
// codice con una sessione (cookie) e manda a `next`. Con i modelli predefiniti
// di Supabase il link arriva invece con la sessione nel frammento `#…` e lo
// gestisce direttamente la pagina /auth/reimposta nel browser.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const registrazione = url.searchParams.get('tipo') === 'registrazione';
  const next = percorsoSicuro(url.searchParams.get('next'), registrazione ? '/corsi' : '/auth/reimposta');

  const supabase = await createSupabaseServerClient();
  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;

  if (registrazione) {
    // Fase 6: conferma dell'email della registrazione autonoma → Persona nell'ente.
    // Se lo scambio fallisce (link aperto su un altro dispositivo) l'email risulta
    // comunque confermata: si entra con email e password.
    if (!ok) return NextResponse.redirect(new URL(`/login?info=conferma&dopo=${encodeURIComponent(next)}`, url.origin));
    const { data: { user } } = await supabase.auth.getUser();
    const esito = user ? await assicuraPersona(user) : { ok: false as const, errore: 'sessione mancante' };
    if (!esito.ok) return NextResponse.redirect(new URL(`/login?errore=registrazione`, url.origin));
    return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL(ok ? next : '/login?errore=link', url.origin));
}
