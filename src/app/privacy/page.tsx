import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { caricaCatalogo, hostRichiesta } from '@/lib/vetrina';
import { Vetrina } from '@/components/vetrina/Vetrina';

export const metadata: Metadata = { title: 'Informativa privacy' };
export const dynamic = 'force-dynamic';

// Testo a cura dell'ente (titolare del trattamento): segnaposto dichiarato.
export default async function PrivacyPage() {
  const supabase = await createSupabaseServerClient();
  const cat = await caricaCatalogo(supabase, await hostRichiesta()).catch(() => ({ ente: null }));
  return (
    <Vetrina ente={cat.ente}>
      <article className="legale">
        <h1>Informativa sul trattamento dei dati personali</h1>
        <div className="banner banner--ocra"><div className="banner__body">L’informativa completa è in preparazione a cura di {cat.ente ?? 'dell’ente'}, titolare del trattamento.</div></div>
        <p>In sintesi: i dati che inserisci (nome, cognome, email, dati di fatturazione) servono a creare il tuo account, gestire l’acquisto e la fattura, tracciare la frequenza ai corsi e rilasciare l’attestato. I pagamenti sono gestiti da Stripe: i dati della carta non passano dai nostri sistemi. I dati sono conservati in data center nell’Unione europea.</p>
      </article>
    </Vetrina>
  );
}
