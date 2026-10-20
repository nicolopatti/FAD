import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Le route che scrivono con la service role (admin; consegna del test, che
// corregge con la service role) modificano il DB e POI registrano l'Evento: se
// la chiave manca, meglio rifiutare subito (503) che lasciare righe senza
// Evento nel registro. Gli eventi del player video/documento e il profilo
// passano per RPC con il client dell'utente e non ne hanno bisogno.
const SCRITTURA = /^\/api\/(admin\/|events\/quiz$|profilo\/(password|informativa)$)/;
// POST di sola lettura (nessuna scrittura, nessun Evento): passano comunque.
const SOLO_LETTURA = /^\/api\/admin\/attestati\/anteprima$/;
const MUTANTI = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (MUTANTI.has(request.method) && SCRITTURA.test(pathname) && !SOLO_LETTURA.test(pathname) && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { ok: false, error: 'Servizio non configurato: manca la chiave di servizio necessaria a registrare l’operazione nel registro. Nessuna modifica è stata fatta.' },
      { status: 503 },
    );
  }
  return updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
