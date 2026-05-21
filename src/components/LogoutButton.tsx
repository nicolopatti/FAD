'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function handleClick() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/login');
  }
  return (
    <button onClick={handleClick} className="btn secondary" disabled={busy}>
      {busy ? '…' : 'Esci'}
    </button>
  );
}
