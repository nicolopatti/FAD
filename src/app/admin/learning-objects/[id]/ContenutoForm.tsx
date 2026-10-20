'use client';

import { useRef, useState } from 'react';
import type { LearningObjectRow } from '@/lib/db-types';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { parseVimeoRef, vimeoEmbedUrl } from '@/lib/vimeo';
import { Icon, fmtDurataSec } from '@/components/admin/Atlante';
import { Field } from '@/components/admin/Form';
import { useCall } from '@/components/admin/useCall';
import { ErrorBanner } from '@/components/admin/ErrorBanner';
import { useFeedback } from '@/components/ui/Feedback';
import { parseMmSs, type Errori } from '@/lib/validazione';

function mmss(sec: number | null | undefined): string {
  if (typeof sec !== 'number' || !Number.isFinite(sec)) return '';
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

/**
 * Pagina del contenuto, parte dati: titolo e, per video e PDF, il contenuto vero
 * con la sostituzione. Sostituire il video o il file non tocca i corsi che lo
 * usano (la sequenza resta la stessa): è il modo per correggere una lezione.
 */
export function ContenutoForm({ lo, inCorsi }: { lo: LearningObjectRow; inCorsi: number }) {
  const { confirm, toast } = useFeedback();
  const { call, busy, error, setError, setBusy } = useCall();
  const [titolo, setTitolo] = useState(lo.titolo);
  const [salvando, setSalvando] = useState(false);
  const [errs, setErrs] = useState<Errori>({});
  const cfg = lo.config ?? {};

  // Video
  const vimeoId = typeof cfg.vimeo_id === 'string' ? cfg.vimeo_id : '';
  const vimeoHash = typeof cfg.vimeo_hash === 'string' ? cfg.vimeo_hash : undefined;
  const durataSec = typeof cfg.durata_secondi === 'number' ? cfg.durata_secondi : null;
  const [vimeo, setVimeo] = useState(vimeoHash ? `https://vimeo.com/${vimeoId}/${vimeoHash}` : vimeoId);
  const [durata, setDurata] = useState(mmss(durataSec));
  const [anteprima, setAnteprima] = useState(false);

  // Documento
  const filename = typeof cfg.filename === 'string' ? cfg.filename : 'documento.pdf';
  const size = typeof cfg.size === 'number' ? cfg.size : null;
  const storageKey = typeof cfg.storage_key === 'string' ? cfg.storage_key : null;
  const fileRef = useRef<HTMLInputElement>(null);
  const [caricando, setCaricando] = useState(false);

  const videoDirty = lo.type === 'video' && (parseVimeoRef(vimeo)?.vimeo_id !== vimeoId || (parseVimeoRef(vimeo)?.vimeo_hash ?? '') !== (vimeoHash ?? '') || parseMmSs(durata) !== durataSec);
  const dirty = titolo.trim() !== lo.titolo || videoDirty;

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    const ve: Errori = {};
    if (!titolo.trim()) ve.titolo = 'Il titolo è obbligatorio.';
    if (lo.type === 'video') {
      if (!parseVimeoRef(vimeo)) ve.vimeo = 'Serve l\'ID numerico o il link del video Vimeo (non di una cartella).';
      const sec = parseMmSs(durata);
      if (sec == null || sec <= 0) ve.durata = 'Formato non valido: usa mm:ss (es. 12:40) o i secondi.';
    }
    setErrs(ve);
    if (Object.keys(ve).length) return;
    if (videoDirty && inCorsi > 0) {
      const ok = await confirm({
        titolo: 'Sostituire il video?',
        messaggio: <>Il nuovo video vale subito in <strong>{inCorsi} {inCorsi === 1 ? 'corso' : 'corsi'}</strong> che usano questa lezione. Chi l&apos;aveva già completata resta completato; chi è a metà riparte dal nuovo video.</>,
        conferma: 'Sostituisci',
      });
      if (!ok) return;
    }
    const body: Record<string, unknown> = {};
    if (titolo.trim() !== lo.titolo) body.titolo = titolo.trim();
    if (videoDirty) body.config = { vimeo_id: vimeo.trim(), durata_secondi: parseMmSs(durata) };
    try {
      await call('PATCH', `/api/admin/learning-objects/${lo.id}`, body, { successo: videoDirty ? 'Video sostituito.' : 'Titolo salvato.', busy: setSalvando });
    } catch { /* banner */ }
  }

  async function sostituisciPdf(file: File) {
    if (file.type !== 'application/pdf') { setError('Il file deve essere un PDF.'); return; }
    if (inCorsi > 0) {
      const ok = await confirm({
        titolo: 'Sostituire il PDF?',
        messaggio: <>Il nuovo file vale subito in <strong>{inCorsi} {inCorsi === 1 ? 'corso' : 'corsi'}</strong> che usano questa lezione. Il file precedente resta in archivio.</>,
        conferma: 'Sostituisci',
      });
      if (!ok) return;
    }
    setCaricando(true);
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const key = `${lo.tenant_id}/${lo.id}-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage.from('documenti').upload(key, file, { contentType: 'application/pdf', upsert: false });
      if (upErr) throw new Error(`Caricamento non riuscito: ${upErr.message}`);
      await call('PATCH', `/api/admin/learning-objects/${lo.id}`, { config: { storage_key: key, mime: 'application/pdf', size: file.size, filename: file.name } }, { successo: 'PDF sostituito.' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCaricando(false);
      setBusy(false);
    }
  }

  async function apriPdf() {
    if (!storageKey) return;
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: e } = await supabase.storage.from('documenti').createSignedUrl(storageKey, 600);
      if (e || !data?.signedUrl) throw new Error(e?.message ?? 'link non disponibile');
      window.open(data.signedUrl, '_blank', 'noopener');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'errore');
    }
  }

  return (
    <form className="card" onSubmit={salva} noValidate>
      <div className="card__head">
        <div>
          <h3>{lo.type === 'video' ? 'Video' : lo.type === 'documento' ? 'Documento PDF' : 'Test'}</h3>
          <div className="sub">
            {lo.type === 'video' ? 'Per cambiare il video, incolla il nuovo ID o link Vimeo e la durata: vale in tutti i corsi che usano questa lezione.'
              : lo.type === 'documento' ? 'Per cambiare il file, caricane uno nuovo: vale in tutti i corsi che usano questa lezione.'
              : 'Regole e domande del test sono qui sotto.'}
          </div>
        </div>
      </div>
      <div className="card__body">
        <ErrorBanner error={error} />
        <Field id="lo-titolo" label="Titolo" required error={errs.titolo}>
          <input id="lo-titolo" className="input" value={titolo} onChange={(e) => setTitolo(e.target.value)} disabled={busy} aria-invalid={Boolean(errs.titolo)} style={{ maxWidth: 640 }} />
        </Field>

        {lo.type === 'video' && (
          <>
            <div className="grid-2" style={{ maxWidth: 640 }}>
              <Field id="lo-vimeo" label="ID o link Vimeo" required error={errs.vimeo} hint="Vale anche il link di un video non in elenco.">
                <input id="lo-vimeo" className="input" value={vimeo} onChange={(e) => setVimeo(e.target.value)} disabled={busy} aria-invalid={Boolean(errs.vimeo)} />
              </Field>
              <Field id="lo-durata" label="Durata" required error={errs.durata} hint="mm:ss, es. 12:40">
                <input id="lo-durata" className="input" value={durata} onChange={(e) => setDurata(e.target.value)} disabled={busy} inputMode="numeric" aria-invalid={Boolean(errs.durata)} />
              </Field>
            </div>
            <div className="row row--wrap" style={{ marginBottom: 12 }}>
              <span className="muted" style={{ fontSize: 13 }}>Video Vimeo <span className="mono">{vimeoId}</span>{durataSec != null && ` · ${fmtDurataSec(durataSec)}`}</span>
              <button type="button" className="btn btn--ghost btn--xs" onClick={() => setAnteprima((v) => !v)}>{anteprima ? 'Nascondi anteprima' : 'Anteprima'}</button>
            </div>
            {anteprima && vimeoId && (
              <div className="video-frame" style={{ maxWidth: 640, marginBottom: 14 }}>
                <iframe src={vimeoEmbedUrl(vimeoId, vimeoHash)} title={lo.titolo} allow="fullscreen; picture-in-picture" style={{ width: '100%', aspectRatio: '16 / 9', border: 0, borderRadius: 12 }} />
              </div>
            )}
          </>
        )}

        {lo.type === 'documento' && (
          <div className="row row--wrap" style={{ marginBottom: 14, gap: 10 }}>
            <span className="chip chip--ocra"><Icon name="documento" /> {filename}</span>
            {size != null && <span className="muted" style={{ fontSize: 13 }}>{Math.round(size / 1024)} KB</span>}
            <button type="button" className="btn btn--ghost btn--sm" onClick={apriPdf} disabled={!storageKey}><Icon name="download" /> Apri il PDF</button>
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => fileRef.current?.click()} disabled={busy}><Icon name="upload" /> {caricando ? 'Carico…' : 'Sostituisci PDF'}</button>
            <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) sostituisciPdf(f); e.target.value = ''; }} />
          </div>
        )}

        <button type="submit" className="btn" disabled={busy || !dirty}>{salvando ? 'Salvo…' : videoDirty ? 'Sostituisci video e salva' : 'Salva'}</button>
      </div>
    </form>
  );
}
