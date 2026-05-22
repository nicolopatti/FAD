'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function NewCorsoForm() {
  const router = useRouter();
  const [titolo, setTitolo] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [sblocco, setSblocco] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/corsi', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          titolo,
          descrizione: descrizione || null,
          sblocco_sequenziale: sblocco,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.replace(`/admin/corsi/${json.corso.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      {error && <div className="alert">{error}</div>}
      <div className="form-row">
        <label htmlFor="titolo">Titolo</label>
        <input
          id="titolo"
          type="text"
          value={titolo}
          onChange={(e) => setTitolo(e.target.value)}
          disabled={busy}
          required
        />
      </div>
      <div className="form-row">
        <label htmlFor="descrizione">Descrizione</label>
        <textarea
          id="descrizione"
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
          Sblocco sequenziale (D26): un LO è accessibile solo dopo il completamento dei precedenti obbligatori
        </label>
      </div>
      <button type="submit" className="btn" disabled={busy}>
        {busy ? 'Salvataggio…' : 'Crea corso'}
      </button>
    </form>
  );
}
