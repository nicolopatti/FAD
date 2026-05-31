'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';

export type NavItem = { key: string; label: string; href: string; ico: string };

const ICON_PATHS: Record<string, string> = {
  courses: 'M4 5h16M4 12h16M4 19h10',
  log: 'M4 6h16M4 12h16M4 18h10',
  check: 'M5 12.5l4 4 10-11',
  audit: 'M4 4h16v4H4zM4 12h16v8H4z',
  report: 'M4 4h16v4H4zM4 12h16v8H4z',
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
          </Link>
        );
      })}
    </>
  );
}
