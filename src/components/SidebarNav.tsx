'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { ICON_PATHS } from './icons';

export type NavItem = { key: string; label: string; href: string; ico: string; count?: number };


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
