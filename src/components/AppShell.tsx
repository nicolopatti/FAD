import Link from 'next/link';
import type { Route } from 'next';
import { LogoutButton } from './LogoutButton';
import { ThemeToggle } from './ThemeToggle';
import { SidebarNav, TopNav, TabNav, type NavItem } from './SidebarNav';

import { ICON_PATHS } from './icons';

export function Ico({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name] ?? ''} />
    </svg>
  );
}

// ============================================================================
// AppShell — sidebar role-aware + area contenuto. Sostituisce TopBar lato
// discente; gli href puntano alle route reali dell'app.
// ============================================================================

type Role = 'discente' | 'auditor' | 'admin';

const NAV_BY_ROLE: Record<Role, { section: string; items: NavItem[] }> = {
  discente: {
    section: 'Apprendimento',
    items: [{ key: 'corsi', label: 'I miei corsi', href: '/corsi', ico: 'courses' }],
  },
  auditor: {
    section: 'Area auditor',
    items: [
      { key: 'audit-log', label: 'Log eventi', href: '/audit/log', ico: 'log' },
      { key: 'audit-compl', label: 'Completamento', href: '/audit/completamento', ico: 'check' },
    ],
  },
  admin: {
    section: 'Amministrazione',
    items: [
      { key: 'dashboard', label: 'Dashboard', href: '/admin', ico: 'dashboard' },
      { key: 'corsi', label: 'Corsi', href: '/admin/corsi', ico: 'corsi' },
      { key: 'contenuti', label: 'Contenuti', href: '/admin/learning-objects', ico: 'libreria' },
      { key: 'sessioni', label: 'Sessioni', href: '/admin/sessioni', ico: 'sessioni' },
      { key: 'report', label: 'Report fondi', href: '/admin/report-fondo', ico: 'report' },
      { key: 'attestati', label: 'Attestati', href: '/admin/attestati', ico: 'shield' },
      { key: 'ente', label: 'Ente', href: '/admin/ente', ico: 'users' },
    ],
  },
};

// Voci del discente: le stesse in testata (desktop) e nella barra in basso (telefono).
const DISCENTE_NAV: NavItem[] = [
  { key: 'corsi', label: 'Corsi', href: '/corsi', ico: 'courses', exact: true },
  { key: 'in-corso', label: 'In corso', href: '/corsi?filtro=in_corso', ico: 'clock' },
  { key: 'profilo', label: 'Profilo', href: '/profilo', ico: 'user' },
];

export function AppShell({
  user,
  role = 'discente',
  children,
  wide = false,
  counts,
  scopeClassName,
}: {
  user: { name?: string; email: string };
  role?: Role;
  /** @deprecated la voce attiva è derivata dal pathname in SidebarNav */
  active?: string;
  children: React.ReactNode;
  wide?: boolean;
  /** conteggi opzionali per voce di nav, indicizzati per `key` */
  counts?: Record<string, number>;
  /** classe extra sull'area contenuto (es. "admin-scope" per il tema admin) */
  scopeClassName?: string;
}) {
  const base = NAV_BY_ROLE[role];
  const section = base.section;
  const items = counts
    ? base.items.map((it) => (counts[it.key] != null ? { ...it, count: counts[it.key] } : it))
    : base.items;
  const displayName = user.name?.trim() || user.email;
  const initial = (user.name?.trim() || user.email || 'U').slice(0, 1).toUpperCase();

  if (role === 'discente') {
    // Discente: testata leggera in alto e, su telefono, barra in basso (tavola "Mobile B").
    return (
      <div className="app app--top">
        <header className="topbar">
          <Link href="/corsi" className="topbar__brand">
            <span className="topbar__mark" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M6 4l14 8-14 8z" /></svg>
            </span>
            FAD
          </Link>
          <nav className="topbar__nav" aria-label="Principale">
            <TopNav items={DISCENTE_NAV} />
          </nav>
          <div className="topbar__user">
            <span>{displayName}</span>
            <span className="topbar__avatar" aria-hidden="true">{initial}</span>
            <ThemeToggle compact />
            <LogoutButton iconOnly />
          </div>
        </header>
        <main>
          <div className={`content ${wide ? 'content--wide' : ''}`}>{children}</div>
        </main>
        <nav className="tabbar" aria-label="Principale">
          <TabNav items={DISCENTE_NAV} />
        </nav>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <div className="sidebar__mark">F</div>
          <div className="sidebar__brandText">
            <strong>FAD</strong>
            <span>Formazione a distanza</span>
          </div>
        </div>

        <div className="sidebar__section">{section}</div>
        <SidebarNav items={items} />

        <div className="sidebar__theme">
          <ThemeToggle />
        </div>
        <div className="sidebar__bottom">
          <div className="sidebar__avatar">{initial}</div>
          <div className="sidebar__user">
            <strong>{displayName}</strong>
            <span>{user.email}</span>
          </div>
          <LogoutButton iconOnly />
        </div>
      </aside>

      <main>
        <div className={`content ${wide ? 'content--wide' : ''} ${scopeClassName ?? ''}`}>
          {children}
        </div>
      </main>
    </div>
  );
}

// ============================================================================
// Breadcrumb
// ============================================================================

export type CrumbItem = { label: string; href?: string };

export function Crumb({ items }: { items: CrumbItem[] }) {
  return (
    <nav className="crumb" aria-label="Briciole di pane">
      {items.map((it, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i > 0 && (
            <span className="sep" aria-hidden="true">
              /
            </span>
          )}
          {it.href ? (
            <Link href={it.href as Route}>{it.label}</Link>
          ) : (
            <span className="here">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

// ============================================================================
// StatusChip — derivato dallo stato reale del progresso.
// ============================================================================

export function StatusChip({
  idonea,
  completati,
}: {
  idonea: boolean;
  completati: number;
}) {
  if (idonea)
    return (
      <span className="chip chip--ok">
        <span className="dot" />
        Completato
      </span>
    );
  if (completati === 0) return <span className="chip chip--ghost">Da iniziare</span>;
  return (
    <span className="chip chip--accent">
      <span className="dot" />
      In corso
    </span>
  );
}
