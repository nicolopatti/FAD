import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
  const nextRaw = url.searchParams.get('next') ?? '/auth/reimposta';
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/';

  const supabase = createSupabaseServerClient();
  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;

  return NextResponse.redirect(new URL(ok ? next : '/login?errore=link', url.origin));
}
