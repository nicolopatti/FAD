'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';

export type NavItem = { key: string; label: string; href: string; ico: string; count?: number };

const ICON_PATHS: Record<string, string> = {
  courses: 'M4 5h16M4 12h16M4 19h10',
  log: 'M4 6h16M4 12h16M4 18h10',
  check: 'M5 12.5l4 4 10-11',
  audit: 'M4 4h16v4H4zM4 12h16v8H4z',
  report: 'M4 4h16v4H4zM4 12h16v8H4z',
  // icone area admin (single-path, coerenti con lo stile lineare)
  dashboard: 'M4 4h6v8H4zM14 4h6v5h-6zM14 13h6v7h-6zM4 16h6v4H4z',
  corsi: 'M5 4h13v16H6a2 2 0 0 1-2-2V5z',
  libreria: 'M4 5v14M9 5v14M14 6l5 1-2 13-5-1z',
  sessioni: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
};

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname() ?? '';
  return (
    <>
      {items.map((n) => {
        const active = pathname === n.href || pathname.startsWith(n.href + '/');
        return (
          <Link
            key={n.key}
            href={n.href as Route}
            className={`sidebar__item ${active ? 'is-active' : ''}`}
          >
            <span className="ico">
              <svg
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={ICON_PATHS[n.ico] ?? ''} />
              </svg>
            </span>
            <span>{n.label}</span>
            {typeof n.count === 'number' && <span className="count">{n.count}</span>}
          </Link>
        );
      })}
    </>
  );
}
