'use client';

import { useState } from 'react';

export function ChainVerifyButton({ streamId }: { streamId: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    null | { ok: true } | { ok: false; problemi: Array<{ seq: number; problema: string }> }
  >(null);

  async function verify() {
    setBusy(true);
    setResult(null);
    const r = await fetch(`/api/audit/verify?stream_id=${streamId}`).then((r) => r.json());
    setBusy(false);
    setResult(r);
  }

  return (
    <div>
      <button className="btn" onClick={verify} disabled={busy}>
        {busy ? 'Verifica…' : 'Verifica integrità catena'}
      </button>
      {result?.ok && (
        <div className="alert ok" style={{ marginTop: 12 }}>
          Catena integra. Tutti gli hash combaciano.
        </div>
      )}
      {result && !result.ok && (
        <div className="alert" style={{ marginTop: 12 }}>
          <strong>Problemi rilevati:</strong>
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
  );
}
