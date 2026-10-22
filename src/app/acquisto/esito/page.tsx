import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { stripeClient } from '@/lib/stripe';
import { completaAnagraficaDaOrdine, confermaSessionePagata } from '@/lib/ordini';
import { caricaCatalogo, hostRichiesta } from '@/lib/vetrina';
import { fmtPrezzo } from '@/lib/vendita';
import { fmtData } from '@/components/admin/Atlante';
import { Vetrina } from '@/components/vetrina/Vetrina';
import { AttesaConferma } from './AttesaConferma';

export const metadata: Metadata = { title: 'Esito dell’acquisto', robots: { index: false } };
export const dynamic = 'force-dynamic';

type OrdineEsito = {
  id: string; stato: string; importo_centesimi: number; valuta: string; stripe_session_id: string | null; iscrizione_id: string | null;
  iscrizione: { edizione_id: string; accesso_fino_al: string | null } | null;
};

/**
 * Ritorno da Stripe (Fase 6). Lo stato lo decide il webhook; se non è ancora
 * arrivato, la pagina chiede a Stripe (server-to-server, con la chiave segreta)
 * lo stato della sessione e, se è pagata, conferma con la stessa RPC
 * idempotente del webhook. Il browser non conferma mai nulla da solo.
 */
export default async function EsitoAcquistoPage(props: { searchParams: Promise<{ ordine?: string; session_id?: string }> }) {
  const sp = await props.searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const cat = await caricaCatalogo(supabase, await hostRichiesta()).catch(() => ({ ente: null }));

  const leggi = async () => (sp.ordine ? (await supabase
    .from('ordine')
    .select('id, stato, importo_centesimi, valuta, stripe_session_id, iscrizione_id, iscrizione:iscrizione_id ( edizione_id, accesso_fino_al )')
    .eq('id', sp.ordine)
    .maybeSingle<OrdineEsito>()).data : null);

  let ordine = await leggi();
  if (ordine?.stato === 'in_attesa' && ordine.stripe_session_id && sp.session_id === ordine.stripe_session_id) {
    const stripe = stripeClient();
    if (stripe) {
      try {
        const sessione = await stripe.checkout.sessions.retrieve(ordine.stripe_session_id);
        const service = createSupabaseServiceClient();
        const esito = await confermaSessionePagata(service, sessione);
        if (esito && !esito.gia_registrato) await completaAnagraficaDaOrdine(service, esito.ordine_id).catch(() => undefined);
        ordine = await leggi();
      } catch { /* resta in attesa: arriverà il webhook */ }
    }
  }

  return (
    <Vetrina ente={cat.ente}>
      <section className="acquisto__esito">
        {!ordine ? (
          <>
            <h1>Ordine non trovato</h1>
            <p className="page-lead">Se hai appena pagato, controlla “I miei corsi” tra qualche istante o la ricevuta che ti ha mandato Stripe.</p>
            <Link className="btn" href="/corsi">I miei corsi</Link>
          </>
        ) : ordine.stato === 'pagato' ? (
          <div className="card"><div className="card__body">
            <h1 style={{ marginTop: 0 }}>Iscrizione completata</h1>
            <p>Pagamento di {fmtPrezzo(ordine.importo_centesimi, ordine.valuta)} confermato. Il corso è nella tua area personale{ordine.iscrizione?.accesso_fino_al ? `, disponibile fino al ${fmtData(ordine.iscrizione.accesso_fino_al)}` : ''}.</p>
            <p className="muted">La ricevuta del pagamento arriva per email da Stripe. Gli acquisti sono nel tuo profilo.</p>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {ordine.iscrizione && <Link className="btn" href={`/corsi/${ordine.iscrizione.edizione_id}`}>Inizia il corso</Link>}
              <Link className="btn btn--secondary" href="/profilo">I miei acquisti</Link>
            </div>
          </div></div>
        ) : ordine.stato === 'in_attesa' ? (
          <div className="card"><div className="card__body">
            <h1 style={{ marginTop: 0 }}>Stiamo aspettando la conferma del pagamento</h1>
            <p>Di solito bastano pochi secondi. Questa pagina si aggiorna da sola.</p>
            <AttesaConferma />
          </div></div>
        ) : ordine.stato === 'rimborsato' ? (
          <div className="card"><div className="card__body"><h1 style={{ marginTop: 0 }}>Ordine rimborsato</h1><p>Questo ordine è stato rimborsato.</p></div></div>
        ) : (
          <div className="card"><div className="card__body">
            <h1 style={{ marginTop: 0 }}>Pagamento non completato</h1>
            <p>Nessun addebito. Puoi tornare al catalogo e riprovare.</p>
            <Link className="btn" href="/catalogo">Torna al catalogo</Link>
          </div></div>
        )}
      </section>
    </Vetrina>
  );
}
