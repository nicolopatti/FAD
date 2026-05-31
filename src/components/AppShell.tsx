import Link from 'next/link';
import type { Route } from 'next';
import { LogoutButton } from './LogoutButton';

// ============================================================================
// Icone — set minimale portato dal mockup (path SVG semplici).
// ============================================================================

const ICON_PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V21H3z',
  courses: 'M4 5h16M4 12h16M4 19h10',
  play: 'M6 4l14 8L6 20z',
  audit: 'M4 4h16v4H4zM4 12h16v8H4z',
  log: 'M4 6h16M4 12h16M4 18h10',
  check: 'M5 12.5l4 4 10-11',
  lock: 'M8 11V7a4 4 0 0 1 8 0v4M6 11h12v10H6z',
  chevR: 'M9 6l6 6-6 6',
  chevL: 'M15 6l-6 6 6 6',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  report: 'M4 4h16v4H4zM4 12h16v8H4z',
};

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

type NavItem = { key: string; label: string; href: string; ico: string };

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
      { key: 'lo', label: 'Learning Object', href: '/admin/learning-objects', ico: 'audit' },
      { key: 'corsi', label: 'Corsi', href: '/admin/corsi', ico: 'courses' },
      { key: 'sessioni', label: 'Sessioni', href: '/admin/sessioni', ico: 'log' },
      { key: 'report', label: 'Report fondi', href: '/admin/report-fondo', ico: 'report' },
    ],
  },
};

export function AppShell({
  user,
  role = 'discente',
  active,
  children,
  wide = false,
}: {
  user: { name?: string; email: string };
  role?: Role;
  active?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const { section, items } = NAV_BY_ROLE[role];
  const displayName = user.name?.trim() || user.email;
  const initial = (user.name?.trim() || user.email || 'U').slice(0, 1).toUpperCase();

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
        {items.map((n) => (
          <Link
            key={n.key}
            href={n.href as Route}
            className={`sidebar__item ${active === n.key ? 'is-active' : ''}`}
          >
            <span className="ico">
              <Ico name={n.ico} />
            </span>
            <span>{n.label}</span>
          </Link>
        ))}

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
        <div className={`content ${wide ? 'content--wide' : ''}`}>{children}</div>
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
// Cover — solo gradiente + iniziale (niente immagini: non sono nel modello dati).
// ============================================================================

export function Cover({
  gradient = 1,
  initial = 'F',
  tag,
}: {
  gradient?: number;
  initial?: string;
  tag?: string;
}) {
  return (
    <div className={`course-card__cover cover-grad-${gradient}`}>
      {tag && <span className="course-card__cover-tag">{tag}</span>}
      <div className="course-card__cover-fallback">{initial}</div>
    </div>
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
        Idoneità ottenuta
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
