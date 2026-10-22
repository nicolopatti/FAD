import Link from 'next/link';
import type { ReactNode } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ThemeToggle } from '@/components/ThemeToggle';

/**
 * Cornice delle pagine pubbliche della vendita (catalogo, scheda, registrazione,
 * acquisto): intestazione con il nome dell'ente, accesso o "I miei corsi",
 * piè di pagina con le pagine legali. Nessun dato personale oltre al nome di
 * chi è già entrato.
 */
export async function Vetrina({ ente, children }: { ente: string | null; children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const anno = new Date().getFullYear();
  return (
    <div className="vetrina">
      <header className="vetrina__head">
        <Link href="/catalogo" className="topbar__brand">
          <span className="topbar__mark" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M6 4l14 8L6 20z" /></svg></span>
          <span>{ente ?? 'Formazione'}</span>
        </Link>
        <nav className="vetrina__nav" aria-label="Navigazione">
          <Link href="/catalogo">Catalogo</Link>
          {user ? <Link href="/corsi" className="btn btn--secondary btn--sm">I miei corsi</Link> : (
            <>
              <Link href="/login">Accedi</Link>
              <Link href="/registrati" className="btn btn--sm">Registrati</Link>
            </>
          )}
          <ThemeToggle />
        </nav>
      </header>
      <main className="vetrina__main">{children}</main>
      <footer className="vetrina__foot">
        <span>© {anno} {ente ?? ''}</span>
        <nav aria-label="Informazioni legali">
          <Link href="/termini">Termini di vendita</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </footer>
    </div>
  );
}
