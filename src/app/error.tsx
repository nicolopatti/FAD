'use client';

import { ErrorState } from '@/components/ui/PageStates';

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="state-page">
      <ErrorState
        messaggio="Non siamo riusciti a caricare la pagina. Riprova tra qualche istante; se il problema continua, avvisa il referente della formazione."
        dettaglio={error.message}
        onRetry={reset}
        homeHref="/"
      />
    </main>
  );
}
