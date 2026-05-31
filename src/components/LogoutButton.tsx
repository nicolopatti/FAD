'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function LogoutButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function handleClick() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (iconOnly) {
    return (
      <button onClick={handleClick} className="sidebar__logout" title="Esci" disabled={busy} aria-label="Esci">
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
      </button>
    );
  }

  return (
    <button onClick={handleClick} className="btn secondary" disabled={busy}>
      {busy ? '…' : 'Esci'}
    </button>
  );
}
