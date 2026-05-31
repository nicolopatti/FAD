'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { IscrittoOption } from './CodaResolver';
import { Icon } from '@/components/admin/Atlante';

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

  const [iscrizioneId, setIscrizioneId] = useState(tuttiIscritti[0]?.id ?? '');
  const [durata, setDurata] = useState('');
  const [motivazione, setMotivazione] = useState('');

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
      <span className="chip chip--muted">auto</span>
    ) : p.origine === 'corretta' ? (
      <span className="chip chip--ocra">corretta</span>
    ) : (
      <span className="chip chip--teal">manuale</span>
    );

  return (
    <div className="card">
      <div className="card__head">
        <div>
          <h3>Presenze registrate</h3>
          <div className="sub">
            Le presenze sono Eventi. Una correzione è un <em>nuovo</em> Evento che sostituisce
            semanticamente il precedente (che resta nel log, barrato qui). Motivazione obbligatoria.
          </div>
        </div>
        <span className="chip chip--muted">{presenze.filter((p) => !p.superseded).length}</span>
      </div>
      <div className="card__body">
        {error && <div className="banner banner--err"><Icon name="alert" className="banner__icon" /><div className="banner__body">{error}</div></div>}

        {presenze.length === 0 ? (
          <div className="muted">Nessuna presenza registrata per questa sessione.</div>
        ) : (
          <table className="tbl tbl--zebra">
            <thead>
              <tr><th>Iscritto</th><th style={{ width: 120 }}>Durata</th><th style={{ width: 160 }}>Origine</th><th style={{ width: 110 }}></th></tr>
            </thead>
            <tbody>
              {presenze.map((p) => (
                <tr key={p.id} className={p.superseded ? 'strike' : undefined}>
                  <td>{p.iscrizioneLabel}</td>
                  <td className="mono">{p.durata ?? '—'}</td>
                  <td>{badge(p)}{p.superseded && <span className="chip chip--muted" style={{ marginLeft: 4 }}>superata</span>}</td>
                  <td>
                    {!p.superseded && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--xs"
                        onClick={() => { setCorreggiId(correggiId === p.id ? null : p.id); setCorrDurata(p.durata ?? ''); setCorrMotivazione(''); }}
                        disabled={busy}
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
          <div style={{ border: '1px dashed var(--line-strong)', borderRadius: 'var(--r-lg)', padding: 16, marginTop: 12 }}>
            <h4 style={{ marginTop: 0, marginBottom: 12 }}>Correggi presenza</h4>
            <div className="grid-2">
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Durata corretta (minuti)</label>
                <input className="input" value={corrDurata} onChange={(e) => setCorrDurata(e.target.value)} disabled={busy} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Motivazione (obbligatoria)</label>
                <input className="input" value={corrMotivazione} onChange={(e) => setCorrMotivazione(e.target.value)} disabled={busy} placeholder="es. orario di join errato nel CSV" />
              </div>
            </div>
            <button
              type="button"
              className="btn btn--sm"
              style={{ marginTop: 12 }}
              disabled={busy || !corrDurata.trim() || !corrMotivazione.trim()}
              onClick={() => call(`/api/admin/presenze/${correggiId}/correggi`, { durata: corrDurata, motivazione: corrMotivazione }, () => setCorreggiId(null))}
            >
              {busy ? '…' : 'Salva correzione'}
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); call(`/api/admin/sessioni/${sessioneId}/presenza-manuale`, { iscrizione_id: iscrizioneId, durata, motivazione }, () => { setDurata(''); setMotivazione(''); }); }}
          style={{ borderTop: '1px dashed var(--line)', paddingTop: 14, marginTop: 14 }}
        >
          <h4 style={{ marginTop: 0, marginBottom: 6 }}>Aggiungi presenza manuale</h4>
          <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            Per un partecipante presente in chiamata ma assente dal report (es. autenticato con un altro nome).
          </div>
          <div className="grid-2">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Iscritto</label>
              <select className="select" value={iscrizioneId} onChange={(e) => setIscrizioneId(e.target.value)} disabled={busy || tuttiIscritti.length === 0}>
                {tuttiIscritti.length === 0 && <option value="">(nessun iscritto)</option>}
                {tuttiIscritti.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Durata (minuti)</label>
              <input className="input" value={durata} onChange={(e) => setDurata(e.target.value)} disabled={busy} placeholder="es. 120" />
            </div>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Motivazione (obbligatoria)</label>
            <input className="input" value={motivazione} onChange={(e) => setMotivazione(e.target.value)} disabled={busy} placeholder="es. presente in aula virtuale, non nel report" />
          </div>
          <button type="submit" className="btn btn--sm" disabled={busy || !iscrizioneId || !durata.trim() || !motivazione.trim()}>
            {busy ? '…' : 'Aggiungi presenza'}
          </button>
        </form>
      </div>
    </div>
  );
}
