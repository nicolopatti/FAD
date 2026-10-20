'use client';

import { ErrorState } from '@/components/ui/PageStates';

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      titolo="Pagina non caricata"
      messaggio="Il database non ha risposto o ha restituito un errore. Nessun dato è stato modificato. Riprova; se continua, controlla lo stato del progetto Supabase."
      dettaglio={error.message}
      onRetry={reset}
      homeHref="/admin"
      homeLabel="Dashboard"
    />
  );
}
