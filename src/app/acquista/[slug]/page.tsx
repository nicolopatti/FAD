import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { caricaScheda, durataAccesso, edizioneGiaIscritta, hostRichiesta } from '@/lib/vetrina';
import { fmtPrezzo, motivoNonVendibile, scorporoIva } from '@/lib/vendita';
import { stripeInProva } from '@/lib/stripe';
import { fmtData } from '@/components/admin/Atlante';
import { Vetrina } from '@/components/vetrina/Vetrina';
import { AcquistoForm } from './AcquistoForm';

export const metadata: Metadata = { title: 'Iscrizione al corso', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * Riepilogo e dati di fatturazione prima del pagamento (Fase 6). Serve
 * l'account (§10.2): senza, la pagina propone registrazione o accesso e poi
 * torna qui.
 */
export default async function AcquistaPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<{ annullato?: string }> }) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const supabase = await createSupabaseServerClient();
  const s = await caricaScheda(supabase, await hostRichiesta(), slug);
  if (!s) notFound();
  const dopo = `/acquista/${s.slug}`;

  const { data: { user } } = await supabase.auth.getUser();
  const { data: persona } = user
    ? await supabase.from('persona').select('id, nome, cognome, codice_fiscale').eq('auth_user_id', user.id)
        .maybeSingle<{ id: string; nome: string; cognome: string; codice_fiscale: string | null }>()
    : { data: null };
  const giaIscritto = persona ? await edizioneGiaIscritta(supabase, s.offerta_id) : null;

  const iva = scorporoIva(s.prezzo_centesimi, s.aliquota_iva);
  const quando = s.tipo === 'online'
    ? durataAccesso(s.accesso_giorni)
    : s.data_inizio ? `Edizione dal ${fmtData(s.data_inizio)}${s.data_fine ? ` al ${fmtData(s.data_fine)}` : ''}` : null;

  return (
    <Vetrina ente={s.ente}>
      <Link href={`/catalogo/${s.slug}`} className="back-link">← Torna al corso</Link>
      <div className="acquisto">
        <section className="acquisto__main">
          <h1>Iscrizione al corso</h1>
          {sp.annullato && <div className="banner banner--ocra"><div className="banner__body">Il pagamento non è stato completato: nessun addebito. Puoi riprovare quando vuoi.</div></div>}
          {stripeInProva() && <div className="banner banner--info"><div className="banner__body">Modalità di prova: il pagamento non è reale (carta di prova 4242 4242 4242 4242).</div></div>}
          {!s.in_vendita ? (
            <div className="banner banner--ocra"><div className="banner__body">{motivoNonVendibile(s.motivo)}</div></div>
          ) : !user ? (
            <div className="card">
              <div className="card__body">
                <h2 style={{ marginTop: 0 }}>Serve un account</h2>
                <p>Con l’account trovi il corso in “I miei corsi”, lo segui quando vuoi e scarichi l’attestato.</p>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <Link className="btn" href={{ pathname: '/registrati', query: { dopo } }}>Crea l’account</Link>
                  <Link className="btn btn--secondary" href={{ pathname: '/login', query: { dopo } }}>Ho già un account</Link>
                </div>
              </div>
            </div>
          ) : giaIscritto ? (
            <div className="card">
              <div className="card__body">
                <h2 style={{ marginTop: 0 }}>Sei già iscritto</h2>
                <p>Il corso è già nella tua area personale: non serve acquistarlo di nuovo.</p>
                <Link className="btn" href={`/corsi/${giaIscritto}`}>Vai al corso</Link>
              </div>
            </div>
          ) : !persona ? (
            <div className="banner banner--ocra"><div className="banner__body">Il tuo account non è ancora completo: <Link href={{ pathname: '/login', query: { dopo } }}>esci e rientra</Link>.</div></div>
          ) : (
            <AcquistoForm slug={s.slug} tipo={s.tipo} iniziale={{ nome: persona.nome, cognome: persona.cognome, codice_fiscale: persona.codice_fiscale ?? '' }} />
          )}
        </section>
        <aside className="acquisto__riepilogo" aria-label="Riepilogo">
          <h2>{s.titolo}</h2>
          {quando && <p className="muted">{quando}</p>}
          <dl className="sintesi">
            {s.listino_centesimi != null && <>
              <dt>Prezzo pieno</dt><dd><s>{fmtPrezzo(s.listino_centesimi, s.valuta)}</s></dd>
              <dt>{s.sconto_etichetta ? `Sconto «${s.sconto_etichetta}»` : 'Sconto'}</dt><dd>−{fmtPrezzo(s.listino_centesimi - s.prezzo_centesimi, s.valuta)}</dd>
            </>}
            {s.aliquota_iva > 0 ? <><dt>Imponibile</dt><dd>{fmtPrezzo(iva.imponibile, s.valuta)}</dd><dt>IVA {s.aliquota_iva}%</dt><dd>{fmtPrezzo(iva.iva, s.valuta)}</dd></> : <><dt>IVA</dt><dd>{s.natura_iva ?? 'non applicata'}</dd></>}
            <dt>Totale</dt><dd><strong>{fmtPrezzo(s.prezzo_centesimi, s.valuta)}</strong></dd>
          </dl>
          {s.listino_centesimi != null && s.sconto_fino_al && <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>Prezzo scontato fino al {fmtData(s.sconto_fino_al)}: vale per chi passa al pagamento entro quel giorno.</p>}
          {s.codici_sconto && <p className="muted" style={{ fontSize: 13 }}>Hai un codice sconto? Lo inserisci nella pagina di pagamento.</p>}
          <p className="muted" style={{ fontSize: 13 }}>Il pagamento avviene sulla pagina sicura di Stripe. L’iscrizione è attiva appena il pagamento è confermato.</p>
        </aside>
      </div>
    </Vetrina>
  );
}
