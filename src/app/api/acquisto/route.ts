import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { stripeClient, STRIPE_NON_CONFIGURATO } from '@/lib/stripe';
import { caricaScheda, hostRichiesta } from '@/lib/vetrina';
import { erroreOrdineCrea } from '@/lib/ordini';
import { primoErrore } from '@/lib/validazione';
import { motivoNonVendibile, validaFatturazione, VERSIONE_RECESSO, VERSIONE_TERMINI, type Fatturazione } from '@/lib/vendita';

type Body = { slug?: string; fatturazione?: Partial<Fatturazione>; termini?: boolean; recesso?: boolean };

/**
 * Fase 6 — avvio dell'acquisto: ordine `in_attesa` (RPC `ordine_crea`, che
 * blocca il posto con un lock sull'offerta) e sessione di Stripe Checkout.
 * L'iscrizione NON nasce qui: la crea la conferma di Stripe (webhook firmato o
 * sessione riletta da Stripe nella pagina di esito, stessa RPC idempotente).
 * Risposta: `{ ok, url }` della pagina di pagamento di Stripe.
 */
export async function POST(request: Request) {
  const stripe = stripeClient();
  if (!stripe) return NextResponse.json({ ok: false, error: STRIPE_NON_CONFIGURATO }, { status: 503 });

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Accedi per completare l’acquisto.' }, { status: 401 });
  const { data: persona } = await supabase.from('persona').select('id, tenant_id').eq('auth_user_id', user.id).maybeSingle<{ id: string; tenant_id: string }>();
  if (!persona) return NextResponse.json({ ok: false, error: 'Account non ancora completato: esci e rientra.' }, { status: 403 });

  const body = (await request.json().catch(() => null)) as Body | null;
  const slug = String(body?.slug ?? '').trim().toLowerCase();
  if (!slug) return NextResponse.json({ ok: false, error: 'Corso mancante.' }, { status: 400 });
  const { valori: fatturazione, errori } = validaFatturazione(body?.fatturazione ?? {});
  if (!fatturazione) return NextResponse.json({ ok: false, error: primoErrore(errori) ?? 'Dati di fatturazione non validi.', campo: Object.keys(errori)[0], errori }, { status: 400 });
  if (!body?.termini) return NextResponse.json({ ok: false, error: 'Per procedere serve l’accettazione dei termini di vendita.', campo: 'termini' }, { status: 400 });
  if (!body?.recesso) return NextResponse.json({ ok: false, error: 'Per iniziare subito il corso serve la conferma sull’avvio immediato.', campo: 'recesso' }, { status: 400 });

  const host = await hostRichiesta();
  const scheda = await caricaScheda(supabase, host, slug);
  if (!scheda) return NextResponse.json({ ok: false, error: 'Corso non trovato.' }, { status: 404 });

  const service = createSupabaseServiceClient();
  const ora = new Date().toISOString();
  const { data: ordine, error } = await service.rpc('ordine_crea', {
    p_persona_id: persona.id,
    p_offerta_id: scheda.offerta_id,
    p_fatturazione: fatturazione,
    p_consensi: { termini: VERSIONE_TERMINI, recesso: VERSIONE_RECESSO, accettati_il: ora },
  });
  if (error) {
    const e = erroreOrdineCrea(error.message);
    return NextResponse.json({ ok: false, error: e.error || motivoNonVendibile(e.motivo), motivo: e.motivo }, { status: e.status });
  }
  const o = ordine as {
    ordine_id: string; importo_centesimi: number; listino_centesimi: number; sconto_etichetta: string | null;
    valuta: string; codici_sconto: boolean; sessioni_da_scadere: string[];
  };
  // Sconto a tempo: il prezzo è già quello del giorno; la descrizione lo dice.
  const descrizione = [
    scheda.tipo === 'online' ? 'Corso online' : 'Iscrizione all’edizione',
    o.importo_centesimi < o.listino_centesimi ? (o.sconto_etichetta ? `sconto «${o.sconto_etichetta}»` : 'prezzo scontato') : null,
  ].filter(Boolean).join(' · ');

  // Sessioni di un tentativo precedente: si chiudono, così non si paga due volte.
  for (const vecchia of o.sessioni_da_scadere ?? []) {
    await stripe.checkout.sessions.expire(vecchia).catch(() => undefined);
  }

  const origin = new URL(request.url).origin;
  const metadata = { ordine_id: o.ordine_id, offerta_id: scheda.offerta_id, tenant_id: persona.tenant_id };
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      locale: 'it',
      customer_email: user.email ?? undefined,
      client_reference_id: o.ordine_id,
      metadata,
      payment_intent_data: { metadata, description: `${scheda.titolo} — ${scheda.ente ?? ''}`.trim() },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: o.valuta,
          unit_amount: o.importo_centesimi,
          product_data: { name: scheda.titolo, description: descrizione },
        },
      }],
      allow_promotion_codes: o.codici_sconto || undefined,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      success_url: `${origin}/acquisto/esito?ordine=${o.ordine_id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/acquista/${slug}?annullato=1`,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: `Il pagamento non si è avviato: ${err instanceof Error ? err.message : String(err)}. Riprova tra poco.` }, { status: 502 });
  }

  const { error: errSess } = await service.rpc('ordine_imposta_sessione', { p_ordine_id: o.ordine_id, p_session_id: session.id });
  if (errSess) {
    await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
    return NextResponse.json({ ok: false, error: 'Il pagamento non si è avviato: riprova.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, url: session.url, ordine_id: o.ordine_id });
}
