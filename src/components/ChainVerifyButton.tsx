'use client';

import { useState } from 'react';

type Esito =
  | { ok: true }
  | { ok: false; problemi: Array<{ seq: number; problema: string }> }
  | { ok: false; errore: string };

export function ChainVerifyButton({ streamId }: { streamId: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Esito | null>(null);

  async function verify() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/audit/verify?stream_id=${streamId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setResult(json);
    } catch (err) {
      setResult({
        ok: false,
        errore: `Verifica non eseguita: ${err instanceof Error ? err.message : String(err)}. Riprova.`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="btn" onClick={verify} disabled={busy}>
        {busy ? 'Verifica in corso…' : 'Verifica integrità catena'}
      </button>
      <div aria-live="polite">
        {result?.ok && (
          <div className="alert ok" style={{ marginTop: 12 }}>
            Catena integra. Tutti gli hash combaciano.
          </div>
        )}
        {result && !result.ok && 'errore' in result && (
          <div className="alert bad" style={{ marginTop: 12 }}>{result.errore}</div>
        )}
        {result && !result.ok && 'problemi' in result && (
          <div className="alert bad" style={{ marginTop: 12 }}>
            <strong>Catena NON integra: {result.problemi.length} problem{result.problemi.length === 1 ? 'a' : 'i'}.</strong>
            <ul>
              {result.problemi.map((p, i) => (
                <li key={i}>
                  seq {p.seq}: {p.problema}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
