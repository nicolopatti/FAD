import type { Metadata } from 'next';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { caricaCatalogo, hostRichiesta } from '@/lib/vetrina';
import { Vetrina } from '@/components/vetrina/Vetrina';
import { RegistratiForm } from './RegistratiForm';

export const metadata: Metadata = { title: 'Crea il tuo account' };
export const dynamic = 'force-dynamic';

/** Registrazione autonoma (Fase 6): solo sugli indirizzi collegati a un ente. */
export default async function RegistratiPage() {
  const supabase = await createSupabaseServerClient();
  const cat = await caricaCatalogo(supabase, await hostRichiesta()).catch(() => ({ ente: null, offerte: [] }));
  return (
    <Vetrina ente={cat.ente}>
      <section className="registrati">
        {cat.ente ? (
          <>
            <h1>Crea il tuo account</h1>
            <p className="page-lead">Con l’account acquisti i corsi di {cat.ente}, li segui quando vuoi e scarichi gli attestati. Hai già un account? <Link href="/login">Accedi</Link>.</p>
            <RegistratiForm ente={cat.ente} />
          </>
        ) : (
          <>
            <h1>Registrazione non disponibile</h1>
            <p className="page-lead">Questo indirizzo non ha la registrazione aperta. Se ti ha iscritto la tua azienda, le credenziali arrivano per email: <Link href="/login">accedi</Link>.</p>
          </>
        )}
      </section>
    </Vetrina>
  );
}
