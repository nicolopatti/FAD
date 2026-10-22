'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Ricarica la pagina dell'esito finché il server non vede la conferma (max ~1 minuto). */
export function AttesaConferma() {
  const router = useRouter();
  const [giri, setGiri] = useState(0);
  useEffect(() => {
    if (giri >= 20) return;
    const t = setTimeout(() => { router.refresh(); setGiri((g) => g + 1); }, 3000);
    return () => clearTimeout(t);
  }, [giri, router]);
  return giri >= 20
    ? <p className="muted">La conferma tarda ad arrivare. Se hai pagato, l’iscrizione comparirà in “I miei corsi” appena Stripe la conferma: non serve pagare di nuovo.</p>
    : <p className="muted" aria-live="polite">Controllo in corso…</p>;
}
