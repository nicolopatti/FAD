'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  edizioneStato,
  type CorsoRow,
  type EdizioneRow,
  type LearningObjectRow,
  type StrutturaCorsoConLO,
} from '@/lib/db-types';

export function CorsoEditor({
  corso,
  struttura,
  edizioni,
  availableLo,
}: {
  corso: CorsoRow;
  struttura: StrutturaCorsoConLO[];
  edizioni: EdizioneRow[];
  availableLo: LearningObjectRow[];
}) {
  const router = useRouter();
  const [titolo, setTitolo] = useState(corso.titolo);
  const [descrizione, setDescrizione] = useState(corso.descrizione ?? '');
  const [sblocco, setSblocco] = useState(corso.sblocco_sequenziale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // D22 — il Corso è congelato appena ha almeno un'Edizione (anche annullata/
  // conclusa). Il trigger DB rifiuta comunque le write; qui disabilitiamo
  // i controlli UI per riflettere lo stato.
  const frozen = edizioni.length > 0;

  const dirty =
    !frozen && (
      titolo.trim() !== corso.titolo ||
      descrizione.trim() !== (corso.descrizione ?? '') ||
      sblocco !== corso.sblocco_sequenziale
    );

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

  async function concludi(edizioneId: string) {
    if (!confirm('Concludere questa Edizione? Le iscrizioni esistenti restano valide ma l\'Edizione viene marcata come chiusa.')) return;
    await call('POST', `/api/admin/edizioni/${edizioneId}/concludi`);
  }

  async function annulla(edizioneId: string) {
    if (!confirm('Annullare questa Edizione? Operazione tracciata nel log; le iscrizioni esistenti restano.')) return;
    await call('POST', `/api/admin/edizioni/${edizioneId}/annulla`);
  }

  return (
    <>
      <h1>{corso.titolo}</h1>
      {frozen && (
        <div className="alert" style={{ background: '#f0f4ff', borderColor: '#cdd6ff', color: '#1a3d8f' }}>
          <strong>Corso congelato (D22).</strong> Ha {edizioni.length} Edizione/i:
          campi strutturali e Struttura sono in sola lettura. I trigger lato DB
          rifiutano le write anche da API/SQL diretto.
        </div>
      )}
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
            disabled={busy || frozen}
          />
        </div>
        <div className="form-row">
          <label htmlFor="descr">Descrizione</label>
          <textarea
            id="descr"
            rows={3}
            value={descrizione}
            onChange={(e) => setDescrizione(e.target.value)}
            disabled={busy || frozen}
          />
        </div>
        <div className="form-row">
          <label>
            <input
              type="checkbox"
              checked={sblocco}
              onChange={(e) => setSblocco(e.target.checked)}
              disabled={busy || frozen}
            />{' '}
            Sblocco sequenziale (D26)
          </label>
        </div>
        <button type="submit" className="btn" disabled={busy || !dirty || frozen}>
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
                      disabled={busy || frozen}
                      style={{ padding: '2px 8px', fontSize: '0.85em' }}
                    >
                      {s.obbligatorio ? 'Sì' : 'No'}
                    </button>
                  </td>
                  <td style={{ padding: 6 }}>
                    <button
                      type="button"
                      onClick={() => moveLo(i, -1)}
                      disabled={busy || frozen || i === 0}
                      style={{ padding: '2px 8px', fontSize: '0.85em', marginRight: 4 }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveLo(i, 1)}
                      disabled={busy || frozen || i === struttura.length - 1}
                      style={{ padding: '2px 8px', fontSize: '0.85em', marginRight: 4 }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStruttura(s.id)}
                      disabled={busy || frozen}
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

      {!frozen && (
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
      )}

      <EdizioniSection
        corsoId={corso.id}
        edizioni={edizioni}
        busy={busy}
        onConcludi={concludi}
        onAnnulla={annulla}
        onError={setError}
        onBusy={setBusy}
      />
    </>
  );
}

function EdizioniSection({
  corsoId,
  edizioni,
  busy,
  onConcludi,
  onAnnulla,
  onError,
  onBusy,
}: {
  corsoId: string;
  edizioni: EdizioneRow[];
  busy: boolean;
  onConcludi: (id: string) => Promise<void>;
  onAnnulla: (id: string) => Promise<void>;
  onError: (msg: string | null) => void;
  onBusy: (v: boolean) => void;
}) {
  const router = useRouter();
  const [codice, setCodice] = useState('');
  const [dataInizio, setDataInizio] = useState('');
  const [dataFine, setDataFine] = useState('');
  const [fadApertura, setFadApertura] = useState('');
  const [fadChiusura, setFadChiusura] = useState('');

  async function createEdizione(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    onBusy(true);
    try {
      const res = await fetch(`/api/admin/corsi/${corsoId}/edizioni`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          codice,
          data_inizio: dataInizio || null,
          data_fine: dataFine || null,
          fad_apertura: fadApertura || null,
          fad_chiusura: fadChiusura || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setCodice('');
      setDataInizio('');
      setDataFine('');
      setFadApertura('');
      setFadChiusura('');
      router.refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      onBusy(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Edizioni ({edizioni.length})</h3>
      <div className="muted" style={{ marginBottom: 8, fontSize: '0.9em' }}>
        D22 — la creazione della <strong>prima</strong> Edizione congela il Corso
        e la sua Struttura. D29 — ciclo di vita soft: <code>concluso_at</code> /
        <code>annullato_at</code>, niente delete fisico.
      </div>

      {edizioni.length === 0 ? (
        <div className="muted">Nessuna Edizione ancora creata.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #e1e1e1' }}>
              <th style={{ padding: 6 }}>Codice</th>
              <th style={{ padding: 6 }}>Stato</th>
              <th style={{ padding: 6 }}>Date operative</th>
              <th style={{ padding: 6 }}>Finestra FAD</th>
              <th style={{ padding: 6, width: 180 }}>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {edizioni.map((e) => {
              const stato = edizioneStato(e);
              return (
                <tr key={e.id} style={{ borderBottom: '1px solid #f1f1f1' }}>
                  <td style={{ padding: 6 }} className="mono">
                    {e.codice}
                  </td>
                  <td style={{ padding: 6 }}>
                    <span className={`badge ${stato === 'attiva' ? 'ok' : 'muted'}`}>{stato}</span>
                  </td>
                  <td style={{ padding: 6 }} className="muted">
                    {e.data_inizio ?? '—'} → {e.data_fine ?? '—'}
                  </td>
                  <td style={{ padding: 6 }} className="muted">
                    {e.fad_apertura ?? '—'} → {e.fad_chiusura ?? '—'}
                  </td>
                  <td style={{ padding: 6 }}>
                    <button
                      type="button"
                      onClick={() => onConcludi(e.id)}
                      disabled={busy || stato !== 'attiva'}
                      style={{ padding: '2px 8px', fontSize: '0.85em', marginRight: 4 }}
                    >
                      Concludi
                    </button>
                    <button
                      type="button"
                      onClick={() => onAnnulla(e.id)}
                      disabled={busy || stato === 'annullata'}
                      style={{ padding: '2px 8px', fontSize: '0.85em' }}
                    >
                      Annulla
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <form onSubmit={createEdizione} style={{ borderTop: '1px dashed #e1e1e1', paddingTop: 12 }}>
        <h4 style={{ marginTop: 0 }}>Nuova Edizione</h4>
        <div className="form-row">
          <label htmlFor="codice">Codice (univoco nel tenant)</label>
          <input
            id="codice"
            type="text"
            value={codice}
            onChange={(ev) => setCodice(ev.target.value)}
            disabled={busy}
            placeholder="es. ED-2026-01"
            required
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-row">
            <label htmlFor="di">Inizio operativo</label>
            <input id="di" type="date" value={dataInizio} onChange={(ev) => setDataInizio(ev.target.value)} disabled={busy} />
          </div>
          <div className="form-row">
            <label htmlFor="df">Fine operativa</label>
            <input id="df" type="date" value={dataFine} onChange={(ev) => setDataFine(ev.target.value)} disabled={busy} />
          </div>
          <div className="form-row">
            <label htmlFor="fa">Apertura FAD</label>
            <input id="fa" type="date" value={fadApertura} onChange={(ev) => setFadApertura(ev.target.value)} disabled={busy} />
          </div>
          <div className="form-row">
            <label htmlFor="fc">Chiusura FAD</label>
            <input id="fc" type="date" value={fadChiusura} onChange={(ev) => setFadChiusura(ev.target.value)} disabled={busy} />
          </div>
        </div>
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Creo…' : 'Crea Edizione'}
        </button>
      </form>
    </div>
  );
}
