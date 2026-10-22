import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { stripeClient } from '@/lib/stripe';
import { completaAnagraficaDaOrdine, confermaSessionePagata } from '@/lib/ordini';

/**
 * Fase 6 — webhook di Stripe (firmato con STRIPE_WEBHOOK_SECRET). È l'unica
 * via, insieme alla lettura server-to-server della sessione, che crea
 * l'iscrizione. Eventi da abilitare nel pannello di Stripe:
 *   checkout.session.completed, checkout.session.async_payment_succeeded,
 *   checkout.session.async_payment_failed, checkout.session.expired, charge.refunded.
 * Tutte le RPC sono idempotenti: un evento ricevuto due volte non fa danni.
 * Errore → 500, così Stripe riprova; evento che non ci riguarda → 200.
 */
export async function POST(request: Request) {
  const stripe = stripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ ok: false, error: 'webhook non configurato' }, { status: 503 });

  const firma = request.headers.get('stripe-signature');
  const corpo = await request.text();
  let evento: Stripe.Event;
  try {
    if (!firma) throw new Error('firma mancante');
    evento = stripe.webhooks.constructEvent(corpo, firma, secret);
  } catch (err) {
    return NextResponse.json({ ok: false, error: `firma non valida: ${err instanceof Error ? err.message : String(err)}` }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  try {
    switch (evento.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const esito = await confermaSessionePagata(service, evento.data.object).catch((e: Error) => {
          if (e.message.includes('sessione sconosciuta')) return null; // sessione di un altro sistema sullo stesso account
          throw e;
        });
        if (esito && !esito.gia_registrato) await completaAnagraficaDaOrdine(service, esito.ordine_id).catch(() => undefined);
        return NextResponse.json({ ok: true, esito });
      }
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        const { data, error } = await service.rpc('ordine_annulla', { p_session_id: evento.data.object.id });
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, esito: data });
      }
      case 'charge.refunded': {
        const c = evento.data.object;
        const pi = typeof c.payment_intent === 'string' ? c.payment_intent : c.payment_intent?.id;
        // Solo i rimborsi totali revocano l'accesso; un rimborso parziale è un accordo commerciale.
        if (!pi || c.amount_refunded < c.amount) return NextResponse.json({ ok: true, ignorato: 'rimborso parziale' });
        const { data, error } = await service.rpc('ordine_rimborsato', { p_payment_intent: pi, p_attore_persona: null });
        if (error) {
          if (error.message.includes('pagamento sconosciuto')) return NextResponse.json({ ok: true, ignorato: 'pagamento non nostro' });
          throw new Error(error.message);
        }
        return NextResponse.json({ ok: true, esito: data });
      }
      default:
        return NextResponse.json({ ok: true, ignorato: evento.type });
    }
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
