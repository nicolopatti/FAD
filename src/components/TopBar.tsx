import Link from 'next/link';
import { LogoutButton } from './LogoutButton';

export function TopBar({
  email,
  isAuditor,
  isAdmin = false,
}: {
  email: string;
  isAuditor: boolean;
  isAdmin?: boolean;
}) {
  return (
    <div className="topbar">
      <nav>
        {isAuditor ? (
          <>
            <Link href="/audit/log">Log eventi</Link>
            <Link href="/audit/completamento">Completamento</Link>
          </>
        ) : isAdmin ? (
          <>
            <Link href="/admin/learning-objects">Learning Object</Link>
            <Link href="/admin/corsi">Corsi</Link>
            <Link href="/admin/sessioni">Sessioni</Link>
          </>
        ) : (
          <Link href="/corsi">I miei corsi</Link>
        )}
      </nav>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span className="who">
          {email}{' '}
          {isAuditor && <span className="badge muted">auditor</span>}
          {isAdmin && <span className="badge muted">admin</span>}
        </span>
        <LogoutButton />
      </div>
    </div>
  );
}
