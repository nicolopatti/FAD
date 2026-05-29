'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { IngestGrezzoResult } from '@/lib/pipeline';

type MappingState = { nome: string; email: string; durata: string; join: string; leave: string };
const EMPTY_MAPPING: MappingState = { nome: '', email: '', durata: '', join: '', leave: '' };

export function CsvImportForm({ sessioneId }: { sessioneId: string }) {
  const router = useRouter();
  const [csv, setCsv] = useState('');
  const [filename, setFilename] = useState<string | null>(null);
  const [showMapping, setShowMapping] = useState(false);
  const [mapping, setMapping] = useState<MappingState>(EMPTY_MAPPING);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestGrezzoResult | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    setResult(null);
    setError(null);
    setCsv(await file.text());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      // mappatura: invia solo i campi valorizzati (override)
      const mapEntries = Object.entries(mapping).filter(([, v]) => v.trim());
      const mappingPayload = mapEntries.length ? Object.fromEntries(mapEntries) : undefined;

      const res = await fetch(`/api/admin/sessioni/${sessioneId}/import-csv`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csv, mapping: mappingPayload }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json.result as IngestGrezzoResult);
      setCsv('');
      setFilename(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof MappingState, label: string, required: boolean) => (
    <div className="form-row">
      <label htmlFor={`map-${key}`}>{label}{required && ' *'}</label>
      <input
        id={`map-${key}`}
        type="text"
        value={mapping[key]}
        onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
        disabled={busy}
        placeholder="nome esatto della colonna nel CSV"
      />
    </div>
  );

  return (
    <form className="card" onSubmit={submit}>
      <h3 style={{ marginTop: 0 }}>Importa report di partecipazione (CSV)</h3>
      <div className="muted" style={{ marginBottom: 12, fontSize: '0.9em' }}>
        Carica il CSV esportato dalla piattaforma VCS (Teams/Zoom). Colonne attese:
        nome, email, durata (più, opzionali, ingresso/uscita). Le intestazioni comuni
        IT/EN sono riconosciute in automatico; se una colonna chiave non viene trovata
        avrai un errore <em>prima</em> di salvare, e potrai indicarla con la mappatura.
      </div>

      {error && <div className="alert">{error}</div>}
      {result && (
        <div className="alert ok">
          Import riuscito: <strong>{result.righe}</strong> righe salvate (write-once).
          Evento <span className="mono">report_grezzo_importato #{result.evento_seq}</span>.{' '}
          Hash contenuto: <span className="mono hash">{result.hash.slice(0, 16)}…</span>
        </div>
      )}

      <div className="form-row">
        <label htmlFor="file">File CSV</label>
        <input id="file" type="file" accept=".csv,.tsv,.txt,text/csv" onChange={onFile} disabled={busy} />
        {filename && <div className="muted" style={{ marginTop: 4, fontSize: '0.85em' }}>Selezionato: {filename}</div>}
      </div>

      <div className="form-row">
        <label htmlFor="csvtext">…oppure incolla il contenuto CSV</label>
        <textarea
          id="csvtext"
          rows={6}
          value={csv}
          onChange={(e) => { setCsv(e.target.value); setFilename(null); }}
          disabled={busy}
          className="mono"
          style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8 }}
          placeholder={'Name,Email,Duration\nMario Bianchi,mario.bianchi@cliente.it,120'}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <button type="button" className="btn secondary" onClick={() => setShowMapping((v) => !v)} disabled={busy} style={{ fontSize: '0.85em', padding: '4px 10px' }}>
          {showMapping ? 'Nascondi mappatura colonne' : 'Mappatura colonne (avanzato)'}
        </button>
      </div>

      {showMapping && (
        <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: '0.85em', marginBottom: 8 }}>
            Indica il nome esatto della colonna del CSV per ciascun campo (sovrascrive
            il riconoscimento automatico). I campi con * sono obbligatori.
          </div>
          {field('nome', 'Nome', true)}
          {field('email', 'Email', true)}
          {field('durata', 'Durata', true)}
          {field('join', 'Ingresso (join)', false)}
          {field('leave', 'Uscita (leave)', false)}
        </div>
      )}

      <button type="submit" className="btn" disabled={busy || !csv.trim()}>
        {busy ? 'Importo…' : 'Importa CSV'}
      </button>
    </form>
  );
}
