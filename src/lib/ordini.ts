import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

/**
 * Fase 6 — conferma di un pagamento a partire da una Checkout Session letta da
 * Stripe (webhook firmato o lettura server-to-server con la chiave segreta: mai
 * dal browser). Idempotente: la RPC `ordine_pagato` non fa nulla se l'ordine è
 * già pagato. Restituisce l'esito della RPC, o null se la sessione non è pagata.
 */
export async function confermaSessionePagata(service: SupabaseClient, session: Stripe.Checkout.Session) {
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return null;
  const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;
  const { data, error } = await service.rpc('ordine_pagato', {
    p_session_id: session.id,
    p_payment_intent: pi,
    p_importo_pagato: session.amount_total ?? null,
    p_sconto: session.total_details?.amount_discount ?? 0,
  });
  if (error) throw new Error(error.message);
  return data as { ordine_id: string; iscrizione_id: string | null; gia_registrato: boolean; nuova_iscrizione?: boolean };
}

/** Messaggio della RPC `ordine_crea` → frase per l'acquirente + status HTTP. */
export function erroreOrdineCrea(msg: string): { status: number; error: string; motivo: string | null } {
  const motivo = msg.replace(/^.*ordine_crea:\s*/, '').trim();
  if (motivo.includes('già iscritto')) return { status: 409, error: 'Sei già iscritto a questo corso: lo trovi in “I miei corsi”.', motivo: 'già iscritto' };
  if (motivo.includes('fatturazione')) return { status: 400, error: 'Completa i dati di fatturazione.', motivo };
  if (motivo.includes('termini')) return { status: 400, error: 'Per procedere serve l’accettazione dei termini di vendita.', motivo };
  if (motivo.includes('offerta inesistente')) return { status: 404, error: 'Corso non trovato.', motivo };
  return { status: 409, error: '', motivo };
}

/**
 * Dopo il pagamento: se la Persona non ha ancora il codice fiscale e l'ha dato
 * nella fattura (privato), lo si copia in anagrafica (serve all'attestato). Se
 * quel CF è già di un'altra persona dell'ente (indice unico) non si tocca nulla.
 * Evento `persona.updated {campi, origine}` senza valori.
 */
export async function completaAnagraficaDaOrdine(service: SupabaseClient, ordineId: string): Promise<void> {
  const { data: o } = await service.from('ordine').select('tenant_id, persona_id, fatturazione').eq('id', ordineId)
    .maybeSingle<{ tenant_id: string; persona_id: string; fatturazione: { tipo?: string; codice_fiscale?: string } | null }>();
  const cf = o?.fatturazione?.tipo === 'privato' ? (o.fatturazione.codice_fiscale ?? '').trim().toUpperCase() : '';
  if (!o || !cf) return;
  const { data: aggiornata, error } = await service.from('persona').update({ codice_fiscale: cf })
    .eq('id', o.persona_id).is('codice_fiscale', null).select('id').maybeSingle();
  if (error || !aggiornata) return;
  const { appendEvent } = await import('./audit');
  await appendEvent({
    tenantId: o.tenant_id,
    eventType: 'persona.updated',
    actor: { persona_id: o.persona_id, type: 'persona' },
    subjectType: 'persona',
    subjectId: o.persona_id,
    payload: { campi: ['codice_fiscale'], origine: 'acquisto' },
  });
}
