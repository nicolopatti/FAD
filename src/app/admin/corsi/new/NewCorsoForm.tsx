'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/admin/Atlante';

const CATEGORIE = ['Sicurezza', 'Privacy', 'Antincendio', 'Primo soccorso', 'Formazione'];

export function NewCorsoForm() {
  const router = useRouter();
  const [titolo, setTitolo] = useState('');
  const [categoria, setCategoria] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [sblocco, setSblocco] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/corsi', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          titolo,
          descrizione: descrizione || null,
          categoria: categoria || null,
          sblocco_sequenziale: sblocco,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.push(`/admin/corsi/${json.corso.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <span className="eyebrow">Nuovo corso</span>
          <h1>Crea un corso</h1>
          <p>Definisci i dati di base. Comporrai la struttura e aprirai le edizioni nel passo successivo.</p>
        </div>
        <div className="page-head__actions">
          <a className="btn btn--secondary" href="/admin/corsi"><Icon name="arrowLeft" /> Tutti i corsi</a>
        </div>
      </div>

      <form className="card" onSubmit={submit} style={{ maxWidth: 640 }}>
        <div className="card__body">
          {error && (
            <div className="banner banner--err"><Icon name="alert" className="banner__icon" /><div className="banner__body">{error}</div></div>
          )}
          <div className="field">
            <label>Titolo</label>
            <input className="input" value={titolo} onChange={(e) => setTitolo(e.target.value)} disabled={busy} placeholder="es. Sicurezza sul lavoro — Formazione generale" required />
          </div>
          <div className="field">
            <label>Categoria</label>
            <select className="select" value={categoria} onChange={(e) => setCategoria(e.target.value)} disabled={busy}>
              <option value="">— nessuna —</option>
              {CATEGORIE.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Descrizione</label>
            <textarea className="textarea" rows={3} value={descrizione} onChange={(e) => setDescrizione(e.target.value)} disabled={busy} />
          </div>
          <div className="row between" style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-ctrl)', padding: '12px 14px', background: 'var(--bg)', marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13 }}>Sblocco sequenziale</div>
              <div className="muted" style={{ fontSize: 12 }}>Gli oggetti si abilitano uno dopo l&apos;altro, solo a completamento del precedente.</div>
            </div>
            <label className="switch">
              <input type="checkbox" checked={sblocco} onChange={(e) => setSblocco(e.target.checked)} disabled={busy} />
              <span className="switch__track" />
            </label>
          </div>
          <button type="submit" className="btn" disabled={busy}>{busy ? 'Creo…' : 'Crea corso'}</button>
        </div>
      </form>
    </>
  );
}
