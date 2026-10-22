'use client';

import { useCall, ErroreCall } from '@/components/admin/useCall';
import { ErrorBanner } from '@/components/admin/ErrorBanner';
import { useFeedback } from '@/components/ui/Feedback';

/** Rimborso totale dell'ordine (§10.6: con attestato emesso serve una conferma in più). */
export function RimborsoPanel({ ordineId, importo, attestato }: { ordineId: string; importo: string; attestato: string | null }) {
  const { call, busy, error, setError } = useCall();
  const { confirm } = useFeedback();

  async function rimborsa() {
    const ok = await confirm({
      titolo: `Rimborsare ${importo}?`,
      messaggio: `Stripe restituisce l’intero importo sulla carta usata e l’accesso al corso viene revocato. L’operazione non si annulla.${attestato ? ` Attenzione: è già stato emesso l’attestato n. ${attestato}, che resta valido.` : ''}`,
      conferma: 'Rimborsa',
      pericolosa: true,
    });
    if (!ok) return;
    try {
      await call('POST', `/api/admin/ordini/${ordineId}/rimborso`, { conferma_attestato: Boolean(attestato) }, { successo: 'Rimborso eseguito: accesso revocato.', quiet: true });
    } catch (err) {
      // L'attestato è stato emesso dopo il caricamento della pagina: serve la conferma esplicita.
      if (err instanceof ErroreCall && err.dati?.serve_conferma) {
        const ancora = await confirm({ titolo: 'C’è un attestato emesso', messaggio: err.message, conferma: 'Rimborsa comunque', pericolosa: true });
        if (ancora) await call('POST', `/api/admin/ordini/${ordineId}/rimborso`, { conferma_attestato: true }, { successo: 'Rimborso eseguito: accesso revocato.' }).catch(() => {});
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="card">
      <div className="card__head"><h3>Rimborso</h3></div>
      <div className="card__body">
        <ErrorBanner error={error} />
        <p className="muted" style={{ marginTop: 0 }}>Rimborso totale dell’ordine. Per un rimborso parziale usa il pannello di Stripe: l’accesso al corso resta attivo.</p>
        <button type="button" className="btn btn--danger" onClick={rimborsa} disabled={busy}>Rimborsa {importo}</button>
      </div>
    </div>
  );
}
