'use client';

import { ErrorState } from '@/components/ui/PageStates';

export default function CorsiError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="state-page">
      <ErrorState
        titolo="Non riusciamo a caricare i tuoi corsi"
        messaggio="È un problema temporaneo di collegamento al servizio, non del tuo percorso: quello che hai completato è al sicuro. Riprova tra qualche istante."
        dettaglio={error.message}
        onRetry={reset}
        homeHref="/corsi"
        homeLabel="I miei corsi"
      />
    </main>
  );
}
