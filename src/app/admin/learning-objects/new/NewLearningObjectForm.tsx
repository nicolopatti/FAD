'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Icon } from '@/components/admin/Atlante';

type LoType = 'video' | 'documento';

export function NewLearningObjectForm({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [type, setType] = useState<LoType>('video');
  const [titolo, setTitolo] = useState('');
  const [vimeoId, setVimeoId] = useState('');
  const [durata, setDurata] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    setProgress(null);
    try {
      if (titolo.trim() === '') throw new Error('Titolo obbligatorio');

      let body: Record<string, unknown>;
      if (type === 'video') {
        if (vimeoId.trim() === '') throw new Error('Vimeo ID obbligatorio');
        const dur = Number(durata);
        if (!Number.isFinite(dur) || dur <= 0) throw new Error('Durata non valida');
        body = { type: 'video', titolo, config: { vimeo_id: vimeoId.trim(), durata_secondi: dur } };
      } else {
        if (!file) throw new Error('Seleziona un PDF');
        if (file.type !== 'application/pdf') throw new Error('Il file deve essere un PDF');
        const loId = crypto.randomUUID();
        const storageKey = `${tenantId}/${loId}.pdf`;
        setProgress('Carico il PDF su Storage…');
        const supabase = createSupabaseBrowserClient();
        const upload = await supabase.storage.from('documenti').upload(storageKey, file, { contentType: 'application/pdf', upsert: false });
        if (upload.error) throw new Error(`Upload fallito: ${upload.error.message}`);
        body = {
          id: loId,
          type: 'documento',
          titolo,
          config: { storage_key: storageKey, mime: 'application/pdf', size: file.size, filename: file.name },
        };
      }

      setProgress('Creo il contenuto…');
      const res = await fetch('/api/admin/learning-objects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

      router.replace('/admin/learning-objects');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ maxWidth: 640 }}>
      <div className="card__body">
        {error && <div className="banner banner--err"><Icon name="alert" className="banner__icon" /><div className="banner__body">{error}</div></div>}
        {progress && <div className="muted" style={{ marginBottom: 12 }}>{progress}</div>}

        <div className="field">
          <label>Tipo</label>
          <div className="seg seg--mono">
            <button type="button" className={type === 'video' ? 'is-active' : ''} onClick={() => setType('video')} disabled={busy}>Video</button>
            <button type="button" className={type === 'documento' ? 'is-active' : ''} onClick={() => setType('documento')} disabled={busy}>Documento</button>
          </div>
        </div>

        <div className="field">
          <label>Titolo</label>
          <input className="input" value={titolo} onChange={(e) => setTitolo(e.target.value)} disabled={busy} required />
        </div>

        {type === 'video' ? (
          <div className="grid-2">
            <div className="field">
              <label>Vimeo ID</label>
              <input className="input" value={vimeoId} onChange={(e) => setVimeoId(e.target.value)} disabled={busy} placeholder="es. 1084894652" required />
            </div>
            <div className="field">
              <label>Durata (secondi)</label>
              <input className="input" type="number" min={1} value={durata} onChange={(e) => setDurata(e.target.value)} disabled={busy} required />
            </div>
          </div>
        ) : (
          <div className="field">
            <label>File PDF</label>
            <input className="input" type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={busy} required />
            {file && <div className="field__hint">{file.name} · {Math.round(file.size / 1024)} KB</div>}
          </div>
        )}

        <button type="submit" className="btn" disabled={busy}>{busy ? 'Salvataggio…' : 'Crea contenuto'}</button>
      </div>
    </form>
  );
}
