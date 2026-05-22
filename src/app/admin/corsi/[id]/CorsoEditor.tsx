'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CorsoRow, LearningObjectRow, StrutturaCorsoConLO } from '@/lib/db-types';

export function CorsoEditor({
  corso,
  struttura,
  availableLo,
}: {
  corso: CorsoRow;
  struttura: StrutturaCorsoConLO[];
  availableLo: LearningObjectRow[];
}) {
  const router = useRouter();
  const [titolo, setTitolo] = useState(corso.titolo);
  const [descrizione, setDescrizione] = useState(corso.descrizione ?? '');
  const [sblocco, setSblocco] = useState(corso.sblocco_sequenziale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    titolo.trim() !== corso.titolo ||
    descrizione.trim() !== (corso.descrizione ?? '') ||
    sblocco !== corso.sblocco_sequenziale;

  async function call(method: string, url: string, body?: unknown): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveCorso(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    await call('PATCH', `/api/admin/corsi/${corso.id}`, {
      titolo,
      descrizione: descrizione || null,
      sblocco_sequenziale: sblocco,
    });
  }

  async function addLo(loId: string) {
    await call('POST', `/api/admin/corsi/${corso.id}/struttura`, { learning_object_id: loId });
  }

  async function removeStruttura(strutturaId: string) {
    if (!confirm('Rimuovere questo LO dalla Struttura?')) return;
    await call('DELETE', `/api/admin/corsi/${corso.id}/struttura/${strutturaId}`);
  }

  async function toggleObbligatorio(strutturaId: string, current: boolean) {
    await call('PATCH', `/api/admin/corsi/${corso.id}/struttura/${strutturaId}`, {
      obbligatorio: !current,
    });
  }

  async function moveLo(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= struttura.length) return;
    const ordered = struttura.map((s) => s.id);
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    await call('POST', `/api/admin/corsi/${corso.id}/struttura/reorder`, {
      ordered_struttura_ids: ordered,
    });
  }

  return (
    <>
      <h1>{corso.titolo}</h1>
      {error && <div className="alert">{error}</div>}

      <form className="card" onSubmit={saveCorso}>
        <h3 style={{ marginTop: 0 }}>Dati del corso</h3>
        <div className="form-row">
          <label htmlFor="titolo">Titolo</label>
          <input
            id="titolo"
            type="text"
            value={titolo}
            onChange={(e) => setTitolo(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="form-row">
          <label htmlFor="descr">Descrizione</label>
          <textarea
            id="descr"
            rows={3}
            value={descrizione}
            onChange={(e) => setDescrizione(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="form-row">
          <label>
            <input
              type="checkbox"
              checked={sblocco}
              onChange={(e) => setSblocco(e.target.checked)}
              disabled={busy}
            />{' '}
            Sblocco sequenziale (D26)
          </label>
        </div>
        <button type="submit" className="btn" disabled={busy || !dirty}>
          {busy ? 'Salvo…' : 'Salva'}
        </button>
      </form>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Struttura corso ({struttura.length} LO)</h3>
        <div className="muted" style={{ marginBottom: 8, fontSize: '0.9em' }}>
          Sequenza piatta (D25). Le proprietà di ogni LO vivono qui, non sull'LO stesso (D24).
          Il riordino è atomico lato server.
        </div>
        {struttura.length === 0 ? (
          <div className="muted">Nessun Learning Object aggiunto al corso.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #e1e1e1' }}>
                <th style={{ padding: 6, width: 50 }}>#</th>
                <th style={{ padding: 6 }}>Learning Object</th>
                <th style={{ padding: 6, width: 100 }}>Tipo</th>
                <th style={{ padding: 6, width: 150 }}>Regola</th>
                <th style={{ padding: 6, width: 110 }}>Obbligatorio</th>
                <th style={{ padding: 6, width: 160 }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {struttura.map((s, i) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f1f1f1' }}>
                  <td style={{ padding: 6 }}>{s.ordine}</td>
                  <td style={{ padding: 6 }}>
                    {s.learning_object?.titolo ?? <span className="muted">(LO non trovato)</span>}
                  </td>
                  <td style={{ padding: 6 }}>
                    <span className="badge muted">{s.learning_object?.type ?? '?'}</span>
                  </td>
                  <td style={{ padding: 6 }} className="mono">
                    {s.regola_completamento.tipo}
                  </td>
                  <td style={{ padding: 6 }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => toggleObbligatorio(s.id, s.obbligatorio)}
                      disabled={busy}
                      style={{ padding: '2px 8px', fontSize: '0.85em' }}
                    >
                      {s.obbligatorio ? 'Sì' : 'No'}
                    </button>
                  </td>
                  <td style={{ padding: 6 }}>
                    <button
                      type="button"
                      onClick={() => moveLo(i, -1)}
                      disabled={busy || i === 0}
                      style={{ padding: '2px 8px', fontSize: '0.85em', marginRight: 4 }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveLo(i, 1)}
                      disabled={busy || i === struttura.length - 1}
                      style={{ padding: '2px 8px', fontSize: '0.85em', marginRight: 4 }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStruttura(s.id)}
                      disabled={busy}
                      style={{ padding: '2px 8px', fontSize: '0.85em' }}
                    >
                      Rimuovi
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Aggiungi Learning Object</h3>
        {availableLo.length === 0 ? (
          <div className="muted">
            Nessun LO disponibile (tutti gli LO attivi sono già nella Struttura,
            oppure non hai ancora creato Learning Object).
          </div>
        ) : (
          availableLo.map((lo) => (
            <div
              key={lo.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 0',
                borderBottom: '1px solid #f1f1f1',
              }}
            >
              <div>
                <strong>{lo.titolo}</strong>{' '}
                <span className="badge muted">{lo.type}</span>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => addLo(lo.id)}
                disabled={busy}
                style={{ padding: '2px 10px', fontSize: '0.85em' }}
              >
                + Aggiungi
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}
