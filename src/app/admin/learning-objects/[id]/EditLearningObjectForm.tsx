'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LearningObjectRow } from '@/lib/db-types';

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
      const res = await fetch(`/api/admin/learning-objects/${lo.id}/${path}`, {
        method: 'POST',
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

  return (
    <>
      <form className="card" onSubmit={saveTitolo}>
        <h3 style={{ marginTop: 0 }}>Modifica</h3>
        {error && <div className="alert">{error}</div>}
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
        <button type="submit" className="btn" disabled={busy || !dirty}>
          {busy ? 'Salvo…' : 'Salva titolo'}
        </button>
      </form>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{archived ? 'Ripristina' : 'Archivia'}</h3>
        <p className="muted">
          {archived
            ? 'Il Learning Object torna disponibile per essere aggiunto a nuove Strutture corso.'
            : 'Soft-archive (D15/D22): la riga resta consultabile, ma non potrà più essere aggiunta a nuove Strutture corso. Nessun DELETE fisico.'}
        </p>
        <button
          type="button"
          className="btn"
          onClick={archiveOrUnarchive}
          disabled={busy}
        >
          {busy ? '…' : archived ? 'Ripristina' : 'Archivia'}
        </button>
      </div>
    </>
  );
}
