'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useSearchParams } from 'next/navigation';
import { ICON_PATHS } from './icons';

export type NavItem = { key: string; label: string; href: string; ico: string; count?: number; exact?: boolean };


export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname() ?? '';
  return (
    <>
      {items.map((n) => {
        const active = isActive(pathname, '', n);
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

function isActive(pathname: string, search: string, n: NavItem): boolean {
  if (n.key === 'corsi' && pathname.startsWith('/admin/learning-objects')) return true;
  if (n.key === 'persone' && pathname.startsWith('/admin/aziende')) return true;
  const [path, query] = n.href.split('?');
  if (query) return pathname === path && search.includes(query);
  if (n.exact) return pathname === path && !search;
  return pathname === path || pathname.startsWith(path + '/');
}

function NavIcon({ name }: { name: string }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name] ?? ''} />
    </svg>
  );
}

/** Testata del discente (desktop): voci a pillola. */
export function TopNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname() ?? '';
  const search = useSearchParams()?.toString() ?? '';
  return (
    <>
      {items.map((n) => (
        <Link key={n.key} href={n.href as Route} className={isActive(pathname, search, n) ? 'is-active' : ''} aria-current={isActive(pathname, search, n) ? 'page' : undefined}>
          {n.label}
        </Link>
      ))}
    </>
  );
}

/** Barra in basso del discente (telefono). */
export function TabNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname() ?? '';
  const search = useSearchParams()?.toString() ?? '';
  return (
    <>
      {items.map((n) => {
        const active = isActive(pathname, search, n);
        return (
          <Link key={n.key} href={n.href as Route} className={active ? 'is-active' : ''} aria-current={active ? 'page' : undefined}>
            <span className="pill"><NavIcon name={n.ico} /></span>
            {n.label}
          </Link>
        );
      })}
    </>
  );
}
