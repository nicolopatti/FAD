'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFeedback } from '@/components/ui/Feedback';

/**
 * `successo` può essere una funzione della risposta (es. il nome della persona
 * davvero iscritta). `quiet`: in caso di errore niente banner né toast, il
 * chiamante riceve un `ErroreCall` con status e corpo (es. un conflitto da far
 * confermare) e decide lui cosa mostrare.
 */
export type CallOpts = { successo?: string | ((json: Record<string, unknown>) => string); busy?: (v: boolean) => void; quiet?: boolean };
export type CallFn = (method: string, url: string, body?: unknown, opts?: CallOpts) => Promise<unknown>;

export class ErroreCall extends Error {
  status: number;
  dati: Record<string, unknown> | null;
  constructor(message: string, status: number, dati: Record<string, unknown> | null) { super(message); this.status = status; this.dati = dati; }
}

/**
 * Chiamata alle route admin con stato di attesa, errore ed esito: dopo una
 * risposta ok fa `router.refresh()` (le pagine sono Server Component), mostra
 * il toast di successo e propaga l'errore al chiamante (già mostrato nel banner
 * e a comparsa). Chi chiama da un onClick deve chiudere la promessa con catch.
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
      if (!res.ok || !json.ok) throw new ErroreCall(json.error ?? `HTTP ${res.status}`, res.status, json);
      router.refresh();
      if (opts?.successo) toast(typeof opts.successo === 'function' ? opts.successo(json) : opts.successo);
      return json;
    } catch (err) {
      if (opts?.quiet) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      // Anche a comparsa: il banner sta in cima e chi ha scorso la pagina non lo vedrebbe.
      toast(msg, 'errore');
      throw err;
    } finally {
      setBusy(false);
      opts?.busy?.(false);
    }
  }, [router, toast]);

  return { call, busy, error, setError, setBusy };
}
