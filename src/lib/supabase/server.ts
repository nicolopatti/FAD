import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Client Supabase con la sessione dell'utente (cookie). Da Next 16 `cookies()`
 * è asincrona, quindi lo è anche questa funzione: `await createSupabaseServerClient()`.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
          } catch {
            // Contesti di sola lettura (Server Component): il refresh della
            // sessione avviene nel proxy (ex middleware).
          }
        },
      },
    },
  );
}
