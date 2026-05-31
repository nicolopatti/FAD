'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LearningObjectRow } from '@/lib/db-types';
import { Icon } from '@/components/admin/Atlante';

export function EditLearningObjectForm({ lo }: { lo: LearningObjectRow }) {
  const router = useRouter();
  const [titolo, setTitolo] = useState(lo.titolo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const archived = lo.archiviato_at !== null;
  const dirty = titolo.trim() !== lo.titolo;

  async function saveTitolo(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/learning-objects/${lo.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ titolo }),
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

  async function archiveOrUnarchive() {
    setError(null);
    setBusy(true);
    try {
      const path = archived ? 'unarchive' : 'archive';
      const res = await fetch(`/api/admin/learning-objects/${lo.id}/${path}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="card" onSubmit={saveTitolo}>
        <div className="card__head"><h3>Modifica</h3></div>
        <div className="card__body">
          {error && <div className="banner banner--err"><Icon name="alert" className="banner__icon" /><div className="banner__body">{error}</div></div>}
          <div className="field">
            <label>Titolo</label>
            <input className="input" value={titolo} onChange={(e) => setTitolo(e.target.value)} disabled={busy} />
          </div>
          <button type="submit" className="btn" disabled={busy || !dirty}>{busy ? 'Salvo…' : 'Salva titolo'}</button>
        </div>
      </form>

      <div className="card">
        <div className="card__head"><h3>{archived ? 'Ripristina' : 'Archivia'}</h3></div>
        <div className="card__body">
          <p className="muted" style={{ marginBottom: 12 }}>
            {archived
              ? 'Il contenuto torna disponibile per essere aggiunto a nuove strutture corso.'
              : 'Soft-archive: la riga resta consultabile ma non potrà più essere aggiunta a nuove strutture corso. Nessun DELETE fisico.'}
          </p>
          <button type="button" className={`btn ${archived ? '' : 'btn--danger'}`} onClick={archiveOrUnarchive} disabled={busy}>
            <Icon name="archive" /> {busy ? '…' : archived ? 'Ripristina' : 'Archivia'}
          </button>
        </div>
      </div>
    </>
  );
}
