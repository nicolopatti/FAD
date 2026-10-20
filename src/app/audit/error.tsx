'use client';

import { ErrorState } from '@/components/ui/PageStates';

export default function AuditError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      titolo="Report non caricato"
      messaggio="La lettura del registro non è riuscita. Il registro stesso non è stato toccato: è un errore di lettura, non di integrità. Riprova."
      dettaglio={error.message}
      onRetry={reset}
      homeHref="/audit/log"
      homeLabel="Log eventi"
    />
  );
}
