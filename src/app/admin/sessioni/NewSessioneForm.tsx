'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EdizioneConCorso, SessioneModalita, VcsPiattaforma } from '@/lib/db-types';

export function NewSessioneForm({ edizioni }: { edizioni: EdizioneConCorso[] }) {
  const router = useRouter();
  const [edizioneId, setEdizioneId] = useState('');
  const [titolo, setTitolo] = useState('');
  const [modalita, setModalita] = useState<SessioneModalita>('vcs');
  const [piattaforma, setPiattaforma] = useState<VcsPiattaforma>('teams');
  const [meetingId, setMeetingId] = useState('');
  const [dataOra, setDataOra] = useState('');
  const [durata, setDurata] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/sessioni', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          edizione_id: edizioneId,
          titolo,
          modalita,
          vcs_piattaforma: modalita === 'vcs' ? piattaforma : null,
          vcs_meeting_id: modalita === 'vcs' ? meetingId || null : null,
          data_ora: dataOra ? new Date(dataOra).toISOString() : null,
          durata_minuti: durata ? Number(durata) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.push(`/admin/sessioni/${json.sessione.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3 style={{ marginTop: 0 }}>Pianifica una sessione</h3>
      {error && <div className="alert">{error}</div>}

      {edizioni.length === 0 ? (
        <div className="muted">
          Nessuna Edizione disponibile: crea prima un Corso con un&apos;Edizione in{' '}
          <a href="/admin/corsi">Corsi</a>.
        </div>
      ) : (
        <>
          <div className="form-row">
            <label htmlFor="ediz">Edizione</label>
            <select
              id="ediz"
              value={edizioneId}
              onChange={(e) => setEdizioneId(e.target.value)}
              disabled={busy}
              required
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}
            >
              <option value="">— scegli —</option>
              {edizioni.map((ed) => (
                <option key={ed.id} value={ed.id}>
                  {ed.corso?.titolo ?? '(corso?)'} · {ed.codice}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label htmlFor="tit">Titolo</label>
            <input id="tit" type="text" value={titolo} onChange={(e) => setTitolo(e.target.value)} disabled={busy} placeholder="es. Webinar Modulo 1" required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-row">
              <label htmlFor="mod">Modalità</label>
              <select
                id="mod"
                value={modalita}
                onChange={(e) => setModalita(e.target.value as SessioneModalita)}
                disabled={busy}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}
              >
                <option value="vcs">VCS (videoconferenza)</option>
                <option value="aula">Aula</option>
              </select>
            </div>
            {modalita === 'vcs' && (
              <div className="form-row">
                <label htmlFor="piat">Piattaforma VCS</label>
                <select
                  id="piat"
                  value={piattaforma}
                  onChange={(e) => setPiattaforma(e.target.value as VcsPiattaforma)}
                  disabled={busy}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }}
                >
                  <option value="teams">Microsoft Teams</option>
                  <option value="zoom">Zoom</option>
                </select>
              </div>
            )}
          </div>

          {modalita === 'vcs' && (
            <div className="form-row">
              <label htmlFor="meet">ID riunione VCS (per l&apos;import automatico via API, Task 6)</label>
              <input id="meet" type="text" value={meetingId} onChange={(e) => setMeetingId(e.target.value)} disabled={busy} placeholder="es. meeting id Teams" />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-row">
              <label htmlFor="data">Data e ora</label>
              <input id="data" type="datetime-local" value={dataOra} onChange={(e) => setDataOra(e.target.value)} disabled={busy} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }} />
            </div>
            <div className="form-row">
              <label htmlFor="dur">Durata (minuti)</label>
              <input id="dur" type="number" min={0} value={durata} onChange={(e) => setDurata(e.target.value)} disabled={busy} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)' }} />
            </div>
          </div>

          <div className="muted" style={{ fontSize: '0.85em', marginBottom: 8 }}>
            Il docente (incarico) è opzionale e si assegna dopo: una sessione senza
            docente è comunque pianificabile (D30).
          </div>

          <button type="submit" className="btn" disabled={busy || !edizioneId}>
            {busy ? 'Creo…' : 'Pianifica sessione'}
          </button>
        </>
      )}
    </form>
  );
}
