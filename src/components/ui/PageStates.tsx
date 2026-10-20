import Link from 'next/link';
import type { Route } from 'next';

/**
 * Stati di pagina condivisi: scheletro di caricamento, errore, non trovato.
 * Usati da `loading.tsx` / `error.tsx` / `not-found.tsx` delle tre aree.
 */

export function PageSkeleton({ righe = 4, conTesta = true }: { righe?: number; conTesta?: boolean }) {
  return (
    <div className="skeleton-page" aria-busy="true" aria-live="polite">
      <span className="sr-only">Caricamento in corso…</span>
      {conTesta && (
        <div className="skeleton-head">
          <div className="skeleton skeleton--eyebrow" />
          <div className="skeleton skeleton--title" />
          <div className="skeleton skeleton--text" />
        </div>
      )}
      <div className="skeleton-list">
        {Array.from({ length: righe }).map((_, i) => (
          <div key={i} className="skeleton skeleton--card" />
        ))}
      </div>
    </div>
  );
}

export function ErrorState({
  titolo = 'Qualcosa è andato storto',
  messaggio,
  dettaglio,
  onRetry,
  homeHref,
  homeLabel = 'Torna all’inizio',
}: {
  titolo?: string;
  messaggio: string;
  dettaglio?: string;
  onRetry?: () => void;
  homeHref?: string;
  homeLabel?: string;
}) {
  return (
    <div className="state state--error" role="alert">
      <div className="state__icon" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.3 3.9L2.5 17.5A2 2 0 004.2 20.5h15.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      </div>
      <h1 className="state__title">{titolo}</h1>
      <p className="state__text">{messaggio}</p>
      {dettaglio && <p className="state__detail mono">{dettaglio}</p>}
      <div className="state__actions">
        {onRetry && (
          <button type="button" className="btn" onClick={onRetry}>Riprova</button>
        )}
        {homeHref && (
          <Link className="btn btn--secondary" href={homeHref as Route}>{homeLabel}</Link>
        )}
      </div>
    </div>
  );
}

export function NotFoundState({
  titolo = 'Pagina non trovata',
  messaggio = 'L’indirizzo non corrisponde a nessuna pagina, oppure non hai accesso a questo contenuto.',
  homeHref = '/',
  homeLabel = 'Torna all’inizio',
}: {
  titolo?: string;
  messaggio?: string;
  homeHref?: string;
  homeLabel?: string;
}) {
  return (
    <div className="state">
      <div className="state__icon" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
        </svg>
      </div>
      <h1 className="state__title">{titolo}</h1>
      <p className="state__text">{messaggio}</p>
      <div className="state__actions">
        <Link className="btn" href={homeHref as Route}>{homeLabel}</Link>
      </div>
    </div>
  );
}
