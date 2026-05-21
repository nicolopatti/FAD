import Link from 'next/link';
import { LogoutButton } from './LogoutButton';

export function TopBar({
  email,
  isAuditor,
}: {
  email: string;
  isAuditor: boolean;
}) {
  return (
    <div className="topbar">
      <nav>
        {isAuditor ? (
          <>
            <Link href="/audit/log">Log eventi</Link>
            <Link href="/audit/completamento">Completamento</Link>
          </>
        ) : (
          <Link href="/corsi">I miei corsi</Link>
        )}
      </nav>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span className="who">
          {email} {isAuditor && <span className="badge muted">auditor</span>}
        </span>
        <LogoutButton />
      </div>
    </div>
  );
}
