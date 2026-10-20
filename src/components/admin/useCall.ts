'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFeedback } from '@/components/ui/Feedback';

export type CallOpts = { successo?: string; busy?: (v: boolean) => void };
export type CallFn = (method: string, url: string, body?: unknown, opts?: CallOpts) => Promise<unknown>;

/**
 * Chiamata alle route admin con stato di attesa, errore ed esito: dopo una
 * risposta ok fa `router.refresh()` (le pagine sono Server Component), mostra
 * il toast di successo e propaga l'errore al chiamante (già mostrato nel banner).
 */
export function useCall() {
  const router = useRouter();
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback<CallFn>(async (method, url, body, opts) => {
    setBusy(true);
    opts?.busy?.(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.refresh();
      if (opts?.successo) toast(opts.successo);
      return json;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setBusy(false);
      opts?.busy?.(false);
    }
  }, [router, toast]);

  return { call, busy, error, setError, setBusy };
}
