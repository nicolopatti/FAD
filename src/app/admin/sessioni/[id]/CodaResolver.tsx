'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type IscrittoOption = { id: string; label: string };
export type CodaItem = {
  id: string;
  riga: number;
  tipo: 'ambiguo' | 'assente';
  rowNome: string | null;
  rowEmail: string | null;
  candidati: IscrittoOption[];
};

export function CodaResolver({
  items,
  tuttiIscritti,
}: {
  items: CodaItem[];
  tuttiIscritti: IscrittoOption[];
}) {
  if (items.length === 0) {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Coda di riconciliazione</h3>
        <div className="muted">Nessuna riga da risolvere: tutti i partecipanti sono stati riconciliati.</div>
      </div>
    );
  }
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Coda di riconciliazione ({items.length} da risolvere)</h3>
      <div className="muted" style={{ marginBottom: 12, fontSize: '0.9em' }}>
        Righe del report che non hanno prodotto una presenza automatica: match
        <strong> ambiguo</strong> (più iscritti candidati) o <strong>assente</strong> (nessun
        iscritto con quell&apos;email). Scegli l&apos;iscritto corretto e conferma, oppure ignora.
        Ogni scelta è un Evento con motivazione (mai una modifica).
      </div>
      {items.map((it) => (
        <CodaRow key={it.id} item={it} tuttiIscritti={tuttiIscritti} />
      ))}
    </div>
  );
}

function CodaRow({ item, tuttiIscritti }: { item: CodaItem; tuttiIscritti: IscrittoOption[] }) {
  const router = useRouter();
  const options = item.tipo === 'ambiguo' ? item.candidati : tuttiIscritti;
  const [iscrizioneId, setIscrizioneId] = useState(options[0]?.id ?? '');
  const [motivazione, setMotivazione] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, body: unknown) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <span className="mono">riga {item.riga}</span>{' '}
          <strong>{item.rowNome || '(senza nome)'}</strong>{' '}
          {item.rowEmail && <span className="muted">&lt;{item.rowEmail}&gt;</span>}
        </div>
        <span className={`badge ${item.tipo === 'ambiguo' ? 'warn' : 'muted'}`}>{item.tipo}</span>
      </div>

      {error && <div className="alert" style={{ marginTop: 8 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Iscritto</label>
          <select
            value={iscrizioneId}
            onChange={(e) => setIscrizioneId(e.target.value)}
            disabled={busy || options.length === 0}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
          >
            {options.length === 0 && <option value="">(nessun iscritto disponibile)</option>}
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <label>Motivazione (obbligatoria)</label>
          <input
            type="text"
            value={motivazione}
            onChange={(e) => setMotivazione(e.target.value)}
            disabled={busy}
            placeholder="es. confermato dall'elenco iscritti"
          />
        </div>
      </div>

      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn"
          disabled={busy || !iscrizioneId || !motivazione.trim()}
          onClick={() => call(`/api/admin/coda/${item.id}/risolvi`, { iscrizione_id: iscrizioneId, motivazione })}
          style={{ fontSize: '0.85em', padding: '6px 12px' }}
        >
          {busy ? '…' : 'Registra presenza'}
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={busy || !motivazione.trim()}
          onClick={() => call(`/api/admin/coda/${item.id}/ignora`, { motivazione })}
          style={{ fontSize: '0.85em', padding: '6px 12px' }}
          title="Scrive partecipante_non_riconciliato (nessuna presenza)"
        >
          Ignora
        </button>
      </div>
    </div>
  );
}
