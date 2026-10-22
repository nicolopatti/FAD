import Stripe from 'stripe';

/**
 * Fase 6 — client Stripe (solo server). Chiavi da variabili d'ambiente su Vercel:
 * STRIPE_SECRET_KEY (sk_test_… in prova, sk_live_… in esercizio) e
 * STRIPE_WEBHOOK_SECRET (whsec_…). Mai nel repo né in chat. Senza chiave le
 * route di pagamento rispondono 503 (vedi `stripeOppure503`).
 */
let cache: Stripe | null = null;

export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!cache) cache = new Stripe(key, { appInfo: { name: 'FAD' } });
  return cache;
}

export const STRIPE_NON_CONFIGURATO =
  'I pagamenti online non sono ancora attivi: manca la configurazione di Stripe. Nessun addebito è stato fatto.';

/** Modalità di prova (chiavi sk_test_): mostrata all'admin e nella pagina di pagamento. */
export function stripeInProva(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test_');
}
