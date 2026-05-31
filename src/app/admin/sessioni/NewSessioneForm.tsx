'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EdizioneConCorso, SessioneModalita, VcsPiattaforma } from '@/lib/db-types';
import { Icon } from '@/components/admin/Atlante';

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
      <div className="card__head">
        <div className="section-step"><span className="step-num"><Icon name="plus" style={{ width: 14, height: 14 }} /></span><h3>Pianifica una sessione</h3></div>
      </div>
      <div className="card__body">
        {error && (
          <div className="banner banner--err"><Icon name="alert" className="banner__icon" /><div className="banner__body">{error}</div></div>
        )}

        {edizioni.length === 0 ? (
          <div className="empty">
            <Icon name="calendar" className="empty__icon" />
            <div className="empty__t">Nessuna edizione disponibile</div>
            <div className="empty__s">Crea prima un corso con un&apos;edizione per poter pianificare una sessione.</div>
            <div className="empty__action"><a className="btn" href="/admin/corsi">Vai ai corsi</a></div>
          </div>
        ) : (
          <>
            <div className="grid-2">
              <div className="field">
                <label>Edizione</label>
                <select className="select" value={edizioneId} onChange={(e) => setEdizioneId(e.target.value)} disabled={busy} required>
                  <option value="">— scegli —</option>
                  {edizioni.map((ed) => (
                    <option key={ed.id} value={ed.id}>{ed.corso?.titolo ?? '(corso?)'} · {ed.codice}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Titolo</label>
                <input className="input" value={titolo} onChange={(e) => setTitolo(e.target.value)} disabled={busy} placeholder="es. Webinar Modulo 1" required />
              </div>
            </div>

            <div className="grid-2">
              <div className="field">
                <label>Modalità</label>
                <select className="select" value={modalita} onChange={(e) => setModalita(e.target.value as SessioneModalita)} disabled={busy}>
                  <option value="vcs">Webinar (videoconferenza)</option>
                  <option value="aula">Aula</option>
                </select>
              </div>
              {modalita === 'vcs' && (
                <div className="field">
                  <label>Piattaforma</label>
                  <select className="select" value={piattaforma} onChange={(e) => setPiattaforma(e.target.value as VcsPiattaforma)} disabled={busy}>
                    <option value="teams">Microsoft Teams</option>
                    <option value="zoom">Zoom</option>
                  </select>
                </div>
              )}
            </div>

            {modalita === 'vcs' && (
              <div className="field">
                <label>ID riunione (per l&apos;import automatico via API)</label>
                <input className="input" value={meetingId} onChange={(e) => setMeetingId(e.target.value)} disabled={busy} placeholder="es. meeting id Teams" />
              </div>
            )}

            <div className="grid-2">
              <div className="field">
                <label>Data e ora</label>
                <input className="input" type="datetime-local" value={dataOra} onChange={(e) => setDataOra(e.target.value)} disabled={busy} />
              </div>
              <div className="field">
                <label>Durata (minuti)</label>
                <input className="input" type="number" min={0} value={durata} onChange={(e) => setDurata(e.target.value)} disabled={busy} placeholder="90" />
              </div>
            </div>

            <div className="field__hint" style={{ marginBottom: 14 }}>
              Il docente (incarico) è opzionale e si assegna dopo: una sessione senza docente è
              comunque pianificabile.
            </div>

            <button type="submit" className="btn" disabled={busy || !edizioneId}>
              {busy ? 'Creo…' : 'Pianifica sessione'}
            </button>
          </>
        )}
      </div>
    </form>
  );
}
