'use client';

import { useEffect, useRef } from 'react';
import { Icon } from '@/components/admin/Atlante';

/** Errore in cima al pannello; se compare fuori vista, la pagina ci scorre (B2). */
export function ErrorBanner({ error }: { error: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!error || !el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);
  if (!error) return null;
  return (
    <div ref={ref} className="banner banner--err" role="alert">
      <Icon name="alert" className="banner__icon" />
      <div className="banner__body">{error}</div>
    </div>
  );
}
