'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';

export type TabItem = { label: string; href: string; count?: number | null; exact?: boolean };

/**
 * Schede di navigazione di una pagina (corso, edizione, Corsi/Libreria,
 * Rendicontazione/Attestati): ogni scheda è un indirizzo, così i collegamenti
 * dalla dashboard atterrano sulla scheda giusta e il tasto indietro funziona.
 */
export function Tabs({ items, label = 'Sezioni' }: { items: TabItem[]; label?: string }) {
  const pathname = usePathname() ?? '';
  return (
    <nav className="tabs" aria-label={label}>
      {items.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + '/');
        return (
          <Link key={t.href} href={t.href as Route} className={active ? 'is-active' : ''} aria-current={active ? 'page' : undefined}>
            {t.label}
            {typeof t.count === 'number' && <span className="tabs__count">{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
