import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireAdmin } from '@/lib/auth-context';
import { stripeClient, STRIPE_NON_CONFIGURATO } from '@/lib/stripe';

/**
 * Fase 6 — rimborso totale di un ordine pagato. Stripe restituisce l'importo;
 * subito dopo la RPC `ordine_rimborsato` (idempotente: il webhook
 * `charge.refunded` che arriva dopo non fa nulla) segna l'ordine e revoca
 * l'accesso. §10.6: con un attestato valido serve `conferma_attestato`.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await requireAdmin();
  const stripe = stripeClient();
  if (!stripe) return NextResponse.json({ ok: false, error: STRIPE_NON_CONFIGURATO }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { conferma_attestato?: boolean };

  const supabase = await createSupabaseServerClient();
  const { data: o } = await supabase.from('ordine').select('id, stato, stripe_payment_intent, iscrizione_id').eq('id', id)
    .maybeSingle<{ id: string; stato: string; stripe_payment_intent: string | null; iscrizione_id: string | null }>();
  if (!o) return NextResponse.json({ ok: false, error: 'Ordine non trovato.' }, { status: 404 });
  if (o.stato !== 'pagato' || !o.stripe_payment_intent) return NextResponse.json({ ok: false, error: 'Si rimborsano solo gli ordini pagati.' }, { status: 409 });

  if (o.iscrizione_id && !body.conferma_attestato) {
    const { data: att } = await supabase.from('attestato').select('numero').eq('iscrizione_id', o.iscrizione_id).is('sostituito_da', null).maybeSingle<{ numero: string }>();
    if (att) {
      return NextResponse.json({ ok: false, serve_conferma: true, error: `È già stato emesso l’attestato n. ${att.numero}: resta valido anche dopo il rimborso. Confermi il rimborso?` }, { status: 409 });
    }
  }

  try {
    await stripe.refunds.create({ payment_intent: o.stripe_payment_intent, metadata: { ordine_id: o.id } }, { idempotencyKey: `rimborso-${o.id}` });
  } catch (err) {
    return NextResponse.json({ ok: false, error: `Stripe non ha eseguito il rimborso: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }
  const { data, error } = await createSupabaseServiceClient().rpc('ordine_rimborsato', { p_payment_intent: o.stripe_payment_intent, p_attore_persona: session.personaId });
  if (error) return NextResponse.json({ ok: false, error: `Rimborso eseguito su Stripe, ma non registrato: ${error.message}. Arriverà con la notifica di Stripe.` }, { status: 500 });
  return NextResponse.json({ ok: true, esito: data });
}
