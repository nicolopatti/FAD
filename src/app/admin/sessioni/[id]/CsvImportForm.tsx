'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { IngestGrezzoResult } from '@/lib/pipeline';
import { Icon } from '@/components/admin/Atlante';

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
    <div className="field">
      <label>{label}{required && ' *'}</label>
      <input
        className="input"
        value={mapping[key]}
        onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
        disabled={busy}
        placeholder="nome esatto della colonna nel CSV"
      />
    </div>
  );

  return (
    <form className="card" onSubmit={submit}>
      <div className="card__head">
        <div className="section-step"><span className="step-num"><Icon name="upload" style={{ width: 14, height: 14 }} /></span><h3>Importa report di partecipazione (CSV)</h3></div>
      </div>
      <div className="card__body">
        <div className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
          Carica il CSV esportato dalla piattaforma (Teams/Zoom). Colonne attese: nome, email,
          durata (più, opzionali, ingresso/uscita). Le intestazioni comuni IT/EN sono riconosciute
          in automatico; se una colonna chiave non viene trovata avrai un errore <em>prima</em> di
          salvare, e potrai indicarla con la mappatura. Da Excel: salva come CSV.
        </div>

        {error && <div className="banner banner--err"><Icon name="alert" className="banner__icon" /><div className="banner__body">{error}</div></div>}
        {result && (
          <div className="banner banner--info">
            <Icon name="check" className="banner__icon" />
            <div className="banner__body">
              Import riuscito: <strong>{result.righe}</strong> righe salvate (write-once).
              Evento <span className="mono">report_grezzo_importato #{result.evento_seq}</span> ·
              hash <span className="mono">{result.hash.slice(0, 16)}…</span>
            </div>
          </div>
        )}

        <div className="field">
          <label>File CSV</label>
          <input className="input" type="file" accept=".csv,.tsv,.txt,text/csv" onChange={onFile} disabled={busy} />
          {filename && <div className="field__hint">Selezionato: {filename}</div>}
        </div>

        <div className="field">
          <label>…oppure incolla il contenuto CSV</label>
          <textarea
            className="textarea mono"
            rows={6}
            value={csv}
            onChange={(e) => { setCsv(e.target.value); setFilename(null); }}
            disabled={busy}
            placeholder={'Name,Email,Duration\nMario Bianchi,mario.bianchi@cliente.it,120'}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowMapping((v) => !v)} disabled={busy}>
            {showMapping ? 'Nascondi mappatura colonne' : 'Mappatura colonne (avanzato)'}
          </button>
        </div>

        {showMapping && (
          <div style={{ border: '1px dashed var(--line-strong)', borderRadius: 'var(--r-lg)', padding: 16, marginBottom: 14 }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
              Indica il nome esatto della colonna del CSV per ciascun campo (sovrascrive il
              riconoscimento automatico). I campi con * sono obbligatori.
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
      </div>
    </form>
  );
}
