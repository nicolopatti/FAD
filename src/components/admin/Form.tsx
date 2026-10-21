// Primitive dei form dell'area amministratore: campo con etichetta, segno di
// obbligatorietà ed errore accanto al campo (non più solo nel banner in cima),
// e paginatore. Niente hook: importabile ovunque.

import type { ReactNode } from 'react';

export function Field({
  id,
  label,
  required,
  error,
  hint,
  children,
  className,
}: {
  id?: string;
  label: ReactNode;
  required?: boolean;
  error?: string | null;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`field${error ? ' is-invalid' : ''}${className ? ` ${className}` : ''}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="req" aria-hidden="true"> *</span>}
      </label>
      {children}
      {error ? (
        <div className="field__error" id={id ? `${id}-err` : undefined} role="alert">{error}</div>
      ) : hint ? (
        <div className="field__hint">{hint}</div>
      ) : null}
    </div>
  );
}

const SINGOLARI: Record<string, string> = {
  righe: 'riga', iscritti: 'iscritto', iscrizioni: 'iscrizione', sessioni: 'sessione', persone: 'persona',
  aziende: 'azienda', corsi: 'corso', attestati: 'attestato', eventi: 'evento', contenuti: 'contenuto',
};
/** "1 iscritto", non "1 iscritti" (C, stress test 21/10). */
export function singolare(plurale: string): string {
  return SINGOLARI[plurale] ?? plurale;
}

export function Pager({
  page,
  pages,
  total,
  perPage,
  onChange,
  cosa = 'righe',
}: {
  page: number;
  pages: number;
  total: number;
  perPage: number;
  onChange: (p: number) => void;
  cosa?: string;
}) {
  if (total === 0) return null;
  const from = (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  return (
    <div className="pager">
      <span className="pager__info">
        {total <= perPage ? `${total} ${total === 1 ? singolare(cosa) : cosa}` : `${from}–${to} di ${total} ${cosa}`}
      </span>
      {pages > 1 && (
        <span className="pager__nav">
          <button type="button" className="icon-btn" aria-label="Pagina precedente" disabled={page <= 1} onClick={() => onChange(page - 1)}>‹</button>
          <span className="pager__page">{page} / {pages}</span>
          <button type="button" className="icon-btn" aria-label="Pagina successiva" disabled={page >= pages} onClick={() => onChange(page + 1)}>›</button>
        </span>
      )}
    </div>
  );
}

/**
 * Dopo una validazione fallita: porta in vista e mette il fuoco sul primo campo
 * con `aria-invalid` (B2: un errore fuori vista sembrava un pulsante che non fa nulla).
 */
export function focusPrimoErrore(scope?: HTMLElement | null) {
  requestAnimationFrame(() => {
    const el = (scope ?? document).querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  });
}
