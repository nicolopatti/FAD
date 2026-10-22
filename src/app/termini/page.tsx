import type { Metadata } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { caricaCatalogo, hostRichiesta } from '@/lib/vetrina';
import { Vetrina } from '@/components/vetrina/Vetrina';
import { VERSIONE_TERMINI, TESTO_RECESSO } from '@/lib/vendita';

export const metadata: Metadata = { title: 'Termini di vendita' };
export const dynamic = 'force-dynamic';

// Il testo legale lo fornisce l'ente (brief Fase 6, §11): finché non c'è, la
// pagina lo dice chiaramente e riporta solo la clausola accettata all'acquisto.
export default async function TerminiPage() {
  const supabase = await createSupabaseServerClient();
  const cat = await caricaCatalogo(supabase, await hostRichiesta()).catch(() => ({ ente: null }));
  return (
    <Vetrina ente={cat.ente}>
      <article className="legale">
        <h1>Termini e condizioni di vendita</h1>
        <div className="banner banner--ocra"><div className="banner__body">Il testo completo dei termini di vendita è in preparazione a cura di {cat.ente ?? 'dell’ente'}. Per qualsiasi informazione prima dell’acquisto contatta l’ente.</div></div>
        <h2>Avvio immediato e diritto di recesso</h2>
        <p>All’acquisto di un corso online viene chiesto di accettare questa clausola:</p>
        <blockquote>{TESTO_RECESSO}</blockquote>
        <p className="muted">Versione dei termini: {VERSIONE_TERMINI}</p>
      </article>
    </Vetrina>
  );
}
