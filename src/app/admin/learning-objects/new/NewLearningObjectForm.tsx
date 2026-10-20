'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Icon } from '@/components/admin/Atlante';
import { Field } from '@/components/admin/Form';
import { useFeedback } from '@/components/ui/Feedback';
import { parseMmSs, type Errori } from '@/lib/validazione';

type LoType = 'video' | 'documento' | 'quiz';

export function NewLearningObjectForm({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [type, setType] = useState<LoType>('video');
  const [titolo, setTitolo] = useState('');
  const [vimeoId, setVimeoId] = useState('');
  const [durata, setDurata] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [soglia, setSoglia] = useState('70');
  const [tentativi, setTentativi] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errs, setErrs] = useState<Errori>({});
  const [progress, setProgress] = useState<string | null>(null);

  function valida(): Errori {
    const e: Errori = {};
    if (!titolo.trim()) e.titolo = 'Indica il titolo del contenuto.';
    if (type === 'video') {
      if (!vimeoId.trim()) e.vimeo = 'Incolla l\'ID numerico o il link del video Vimeo.';
      const sec = parseMmSs(durata);
      if (!durata.trim()) e.durata = 'Indica la durata, es. 12:40.';
      else if (sec == null || sec <= 0) e.durata = 'Formato non valido: usa mm:ss (es. 12:40) o i secondi.';
    } else if (type === 'quiz') {
      const s = Number(soglia);
      if (!soglia.trim() || !Number.isFinite(s) || s < 0 || s > 100) e.soglia = 'Percentuale da 0 a 100.';
      if (tentativi.trim() && (!/^\d+$/.test(tentativi.trim()) || Number(tentativi) < 1 || Number(tentativi) > 99)) e.tentativi = 'Numero intero da 1 a 99, oppure vuoto.';
    } else if (!file) {
      e.file = 'Seleziona il file PDF da caricare.';
    } else if (file.type !== 'application/pdf') {
      e.file = 'Il file deve essere un PDF.';
    }
    return e;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const ve = valida();
    setErrs(ve);
    if (Object.keys(ve).length) return;
    setBusy(true);
    setProgress(null);
    try {
      let body: Record<string, unknown>;
      if (type === 'video') {
        body = { type: 'video', titolo: titolo.trim(), config: { vimeo_id: vimeoId.trim(), durata_secondi: parseMmSs(durata) } };
      } else if (type === 'quiz') {
        body = { type: 'quiz', titolo: titolo.trim(), config: { soglia_percentuale: Number(soglia), tentativi_max: tentativi.trim() ? Number(tentativi) : null, ordine_casuale: true, mostra_correzione: true } };
      } else {
        const pdf = file as File;
        const loId = crypto.randomUUID();
        const storageKey = `${tenantId}/${loId}.pdf`;
        setProgress('Carico il PDF…');
        const supabase = createSupabaseBrowserClient();
        const upload = await supabase.storage.from('documenti').upload(storageKey, pdf, { contentType: 'application/pdf', upsert: false });
        if (upload.error) throw new Error(`Caricamento non riuscito: ${upload.error.message}`);
        body = {
          id: loId,
          type: 'documento',
          titolo: titolo.trim(),
          config: { storage_key: storageKey, mime: 'application/pdf', size: pdf.size, filename: pdf.name },
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

      if (type === 'quiz') {
        toast('Test creato: ora aggiungi le domande.');
        router.replace(`/admin/learning-objects/${json.learning_object.id}`);
      } else {
        toast(`"${titolo.trim()}" aggiunto alla libreria.`);
        router.replace('/admin/learning-objects');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
      setProgress(null);
    }
  }

  const clear = (k: string) => { if (errs[k]) setErrs({ ...errs, [k]: '' }); };

  return (
    <form className="card" onSubmit={submit} noValidate style={{ maxWidth: 640 }}>
      <div className="card__body">
        {error && <div className="banner banner--err"><Icon name="alert" className="banner__icon" /><div className="banner__body">{error}</div></div>}

        <div className="field">
          <label>Tipo</label>
          <div className="seg seg--mono">
            <button type="button" className={type === 'video' ? 'is-active' : ''} onClick={() => { setType('video'); setErrs({}); }} disabled={busy}>Video</button>
            <button type="button" className={type === 'documento' ? 'is-active' : ''} onClick={() => { setType('documento'); setErrs({}); }} disabled={busy}>Documento PDF</button>
            <button type="button" className={type === 'quiz' ? 'is-active' : ''} onClick={() => { setType('quiz'); setErrs({}); }} disabled={busy}>Test</button>
          </div>
        </div>

        <Field id="lo-titolo" label="Titolo" required error={errs.titolo}>
          <input id="lo-titolo" className="input" value={titolo} onChange={(e) => { setTitolo(e.target.value); clear('titolo'); }} disabled={busy} autoFocus aria-invalid={Boolean(errs.titolo)} />
        </Field>

        {type === 'video' ? (
          <div className="grid-2">
            <Field id="lo-vimeo" label="ID o link Vimeo" required error={errs.vimeo} hint="Vale anche il link di un video non in elenco.">
              <input id="lo-vimeo" className="input" value={vimeoId} onChange={(e) => { setVimeoId(e.target.value); clear('vimeo'); }} disabled={busy} placeholder="es. 1084894652 oppure https://vimeo.com/1084894652/abc123" aria-invalid={Boolean(errs.vimeo)} />
            </Field>
            <Field id="lo-durata" label="Durata" required error={errs.durata} hint="mm:ss, es. 12:40">
              <input id="lo-durata" className="input" value={durata} onChange={(e) => { setDurata(e.target.value); clear('durata'); }} disabled={busy} placeholder="12:40" inputMode="numeric" aria-invalid={Boolean(errs.durata)} />
            </Field>
          </div>
        ) : type === 'quiz' ? (
          <div className="grid-2">
            <Field id="lo-soglia" label="Soglia di superamento (%)" required error={errs.soglia} hint="Il test è superato con una percentuale di risposte giuste almeno pari alla soglia.">
              <input id="lo-soglia" className="input" type="number" min={0} max={100} value={soglia} onChange={(e) => { setSoglia(e.target.value); clear('soglia'); }} disabled={busy} aria-invalid={Boolean(errs.soglia)} />
            </Field>
            <Field id="lo-tentativi" label="Tentativi massimi" error={errs.tentativi} hint="Vuoto = illimitati. Le domande si aggiungono nel passo successivo.">
              <input id="lo-tentativi" className="input" type="number" min={1} max={99} value={tentativi} onChange={(e) => { setTentativi(e.target.value); clear('tentativi'); }} disabled={busy} placeholder="illimitati" aria-invalid={Boolean(errs.tentativi)} />
            </Field>
          </div>
        ) : (
          <Field id="lo-file" label="File PDF" required error={errs.file} hint={file ? `${file.name} · ${Math.round(file.size / 1024)} KB` : undefined}>
            <input id="lo-file" className="input" type="file" accept="application/pdf" onChange={(e) => { setFile(e.target.files?.[0] ?? null); clear('file'); }} disabled={busy} aria-invalid={Boolean(errs.file)} />
          </Field>
        )}

        <div className="row">
          <button type="submit" className="btn" disabled={busy}>{busy ? 'Salvo…' : type === 'quiz' ? 'Crea test e aggiungi le domande' : 'Crea contenuto'}</button>
          {progress && <span className="muted" style={{ fontSize: 13 }}>{progress}</span>}
        </div>
      </div>
    </form>
  );
}
