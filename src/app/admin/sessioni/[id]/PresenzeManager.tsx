'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { IscrittoOption } from './CodaResolver';

export type PresenzaItem = {
  id: string;
  iscrizioneLabel: string;
  durata: string | null;
  origine: 'automatica' | 'manuale' | 'corretta';
  superseded: boolean;
};

export function PresenzeManager({
  sessioneId,
  presenze,
  tuttiIscritti,
}: {
  sessioneId: string;
  presenze: PresenzaItem[];
  tuttiIscritti: IscrittoOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // form "aggiungi manuale"
  const [iscrizioneId, setIscrizioneId] = useState(tuttiIscritti[0]?.id ?? '');
  const [durata, setDurata] = useState('');
  const [motivazione, setMotivazione] = useState('');

  // correzione inline (per evento)
  const [correggiId, setCorreggiId] = useState<string | null>(null);
  const [corrDurata, setCorrDurata] = useState('');
  const [corrMotivazione, setCorrMotivazione] = useState('');

  async function call(url: string, body: unknown, reset?: () => void) {
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
      reset?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const badge = (p: PresenzaItem) =>
    p.origine === 'automatica' ? (
      <span className="badge muted">auto</span>
    ) : p.origine === 'corretta' ? (
      <span className="badge">corretta</span>
    ) : (
      <span className="badge">manuale</span>
    );

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Presenze registrate ({presenze.filter((p) => !p.superseded).length})</h3>
      <div className="muted" style={{ marginBottom: 8, fontSize: '0.9em' }}>
        Le presenze sono Eventi (D8). Una correzione è un <em>nuovo</em> Evento che
        sostituisce semanticamente il precedente (che resta nel log, barrato qui).
        La motivazione è obbligatoria.
      </div>

      {error && <div className="alert">{error}</div>}

      {presenze.length === 0 ? (
        <div className="muted">Nessuna presenza registrata per questa sessione.</div>
      ) : (
        <table>
          <thead>
            <tr><th>Iscritto</th><th>Durata</th><th>Origine</th><th style={{ width: 110 }}></th></tr>
          </thead>
          <tbody>
            {presenze.map((p) => (
              <tr key={p.id} style={p.superseded ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>
                <td>{p.iscrizioneLabel}</td>
                <td className="mono">{p.durata ?? '—'}</td>
                <td>{badge(p)}{p.superseded && <span className="badge muted" style={{ marginLeft: 4 }}>superata</span>}</td>
                <td>
                  {!p.superseded && (
                    <button
                      type="button"
                      onClick={() => { setCorreggiId(correggiId === p.id ? null : p.id); setCorrDurata(p.durata ?? ''); setCorrMotivazione(''); }}
                      disabled={busy}
                      style={{ padding: '2px 8px', fontSize: '0.85em' }}
                    >
                      {correggiId === p.id ? 'Annulla' : 'Correggi'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {correggiId && (
        <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 12, marginTop: 8 }}>
          <h4 style={{ marginTop: 0 }}>Correggi presenza</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label>Durata corretta (minuti)</label>
              <input type="text" value={corrDurata} onChange={(e) => setCorrDurata(e.target.value)} disabled={busy} />
            </div>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label>Motivazione (obbligatoria)</label>
              <input type="text" value={corrMotivazione} onChange={(e) => setCorrMotivazione(e.target.value)} disabled={busy} placeholder="es. orario di join errato nel CSV" />
            </div>
          </div>
          <button
            type="button"
            className="btn"
            disabled={busy || !corrDurata.trim() || !corrMotivazione.trim()}
            onClick={() => call(`/api/admin/presenze/${correggiId}/correggi`, { durata: corrDurata, motivazione: corrMotivazione }, () => setCorreggiId(null))}
            style={{ marginTop: 8, fontSize: '0.85em', padding: '6px 12px' }}
          >
            {busy ? '…' : 'Salva correzione'}
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); call(`/api/admin/sessioni/${sessioneId}/presenza-manuale`, { iscrizione_id: iscrizioneId, durata, motivazione }, () => { setDurata(''); setMotivazione(''); }); }}
        style={{ borderTop: '1px dashed var(--border)', paddingTop: 12, marginTop: 12 }}
      >
        <h4 style={{ marginTop: 0 }}>Aggiungi presenza manuale</h4>
        <div className="muted" style={{ fontSize: '0.85em', marginBottom: 8 }}>
          Per un partecipante presente in chiamata ma assente dal report (es. autenticato con un altro nome).
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label>Iscritto</label>
            <select
              value={iscrizioneId}
              onChange={(e) => setIscrizioneId(e.target.value)}
              disabled={busy || tuttiIscritti.length === 0}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
            >
              {tuttiIscritti.length === 0 && <option value="">(nessun iscritto)</option>}
              {tuttiIscritti.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label>Durata (minuti)</label>
            <input type="text" value={durata} onChange={(e) => setDurata(e.target.value)} disabled={busy} placeholder="es. 120" />
          </div>
        </div>
        <div className="form-row" style={{ marginTop: 8, marginBottom: 8 }}>
          <label>Motivazione (obbligatoria)</label>
          <input type="text" value={motivazione} onChange={(e) => setMotivazione(e.target.value)} disabled={busy} placeholder="es. presente in aula virtuale, non nel report" />
        </div>
        <button type="submit" className="btn" disabled={busy || !iscrizioneId || !durata.trim() || !motivazione.trim()} style={{ fontSize: '0.85em', padding: '6px 12px' }}>
          {busy ? '…' : 'Aggiungi presenza'}
        </button>
      </form>
    </div>
  );
}
