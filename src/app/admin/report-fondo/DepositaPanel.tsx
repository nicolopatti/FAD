'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type SnapshotRow = {
  id: string;
  formato: string;
  fondo: string | null;
  generato_at: string;
  hash_evento: string | null;
};

export function DepositaPanel({
  edizione,
  piano,
  formato,
  bloccanti,
  snapshots,
}: {
  edizione: string;
  piano: string;
  formato: string;
  bloccanti: number;
  snapshots: SnapshotRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [needsOverride, setNeedsOverride] = useState(false);
  const [verifiche, setVerifiche] = useState<Record<string, string>>({});

  async function deposita(override: boolean) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch('/api/admin/report-fondo/deposita', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ edizione, piano, formato, override }),
      });
      const json = await res.json();
      if (res.status === 409 && json.bloccanti) {
        setNeedsOverride(true);
        setError(json.error ?? 'Warning bloccanti presenti.');
        return;
      }
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setOk(`Snapshot depositato — Evento #${json.result.evento_seq}, hash ${String(json.result.hash).slice(0, 16)}…`);
      setNeedsOverride(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function verifica(id: string) {
    setVerifiche((v) => ({ ...v, [id]: '…' }));
    try {
      const res = await fetch(`/api/admin/report-fondo/verifica?snapshot=${id}`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setVerifiche((v) => ({ ...v, [id]: json.integra ? 'integra' : 'manomesso' }));
    } catch {
      setVerifiche((v) => ({ ...v, [id]: 'errore' }));
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Deposito (snapshot write-once)</h3>
      <p className="muted" style={{ fontSize: '0.85em' }}>
        Il deposito congela i dati risolti adesso in uno snapshot immutabile e scrive un Evento con
        l&apos;hash nel log (l&apos;auditor lo vede in <span className="mono">/audit/log</span> e può
        verificarne l&apos;integrità). Rigenerare crea un <strong>nuovo</strong> snapshot; i precedenti
        restano invariati.
      </p>

      {error && <div className="alert">{error}</div>}
      {ok && <div className="alert ok">{ok}</div>}

      {!needsOverride ? (
        <button className="btn" disabled={busy} onClick={() => deposita(false)}>
          {busy ? 'Deposito…' : `Deposita (${formato})`}
        </button>
      ) : (
        <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 12 }}>
          <div className="muted" style={{ marginBottom: 8 }}>
            Ci sono <strong>{bloccanti}</strong> warning bloccanti. Confermi il deposito comunque?
          </div>
          <button className="btn" disabled={busy} onClick={() => deposita(true)}>
            {busy ? 'Deposito…' : 'Deposita comunque'}
          </button>{' '}
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => {
              setNeedsOverride(false);
              setError(null);
            }}
          >
            Annulla
          </button>
        </div>
      )}

      <h4 style={{ marginBottom: 8, marginTop: 16 }}>Snapshot depositati ({snapshots.length})</h4>
      {snapshots.length === 0 ? (
        <div className="muted">Nessuno snapshot ancora depositato per questa coppia.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Quando</th>
              <th>Formato</th>
              <th>Hash (Evento)</th>
              <th>Integrità</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((s) => (
              <tr key={s.id}>
                <td className="muted">{new Date(s.generato_at).toLocaleString('it-IT')}</td>
                <td>{s.formato}</td>
                <td className="mono">{s.hash_evento ? `${s.hash_evento.slice(0, 16)}…` : '—'}</td>
                <td>
                  {verifiche[s.id] === 'integra' ? (
                    <span className="badge ok">integra</span>
                  ) : verifiche[s.id] === 'manomesso' ? (
                    <span className="badge bad">manomesso</span>
                  ) : verifiche[s.id] === '…' ? (
                    <span className="muted">…</span>
                  ) : verifiche[s.id] === 'errore' ? (
                    <span className="badge bad">errore</span>
                  ) : (
                    <button
                      className="btn secondary"
                      style={{ fontSize: '0.8em', padding: '2px 8px' }}
                      onClick={() => verifica(s.id)}
                    >
                      verifica
                    </button>
                  )}
                </td>
                <td>
                  <a href={`/api/admin/report-fondo/snapshot?snapshot=${s.id}`}>scarica</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
