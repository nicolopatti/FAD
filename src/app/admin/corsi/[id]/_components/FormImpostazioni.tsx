'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { CorsoRow } from '@/lib/db-types';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Icon, Cover, coverUrl } from '@/components/admin/Atlante';
import { Field } from '@/components/admin/Form';
import { useCall } from '@/components/admin/useCall';
import { ErrorBanner } from '@/components/admin/ErrorBanner';
import { parseSoglia } from '@/lib/validazione';

/**
 * Scheda "Impostazioni" del corso: titolo, categoria, descrizione, copertina e
 * regole di fruizione. A corso attivo (ha edizioni) restano modificabili solo
 * descrizione e copertina: il trigger D22 rifiuta il resto.
 */
export function FormImpostazioni({ corso, frozen, nEdizioni, categorie }: { corso: CorsoRow; frozen: boolean; nEdizioni: number; categorie: string[] }) {
  const { call, busy, error, setError, setBusy } = useCall();
  const [salvando, setSalvando] = useState(false);
  const [errTitolo, setErrTitolo] = useState<string | null>(null);
  const [titolo, setTitolo] = useState(corso.titolo);
  const [categoria, setCategoria] = useState(corso.categoria ?? '');
  const [descrizione, setDescrizione] = useState(corso.descrizione ?? '');
  const [sblocco, setSblocco] = useState(corso.sblocco_sequenziale);
  const [integrale, setIntegrale] = useState(Boolean(corso.visione_integrale));
  const sogliaIniziale = corso.soglia_frequenza_percentuale != null ? String(Number(corso.soglia_frequenza_percentuale)).replace('.', ',') : '';
  const [soglia, setSoglia] = useState(sogliaIniziale);
  const [errSoglia, setErrSoglia] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const descrizioneDirty = descrizione.trim() !== (corso.descrizione ?? '');
  const dirty = frozen
    ? descrizioneDirty
    : titolo.trim() !== corso.titolo ||
      (categoria || null) !== (corso.categoria ?? null) ||
      descrizioneDirty ||
      sblocco !== corso.sblocco_sequenziale ||
      integrale !== Boolean(corso.visione_integrale) ||
      soglia.trim() !== sogliaIniziale;

  const catOptions = useMemo(() => {
    const set = [...categorie];
    if (categoria && !set.includes(categoria)) set.push(categoria);
    return set;
  }, [categorie, categoria]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    if (!frozen && !titolo.trim()) { setErrTitolo('Il titolo è obbligatorio.'); return; }
    setErrTitolo(null);
    if (!frozen && parseSoglia(soglia) === undefined) { setErrSoglia('Indica una percentuale tra 1 e 100, oppure lascia vuoto.'); return; }
    setErrSoglia(null);
    const body = frozen
      ? { descrizione: descrizione.trim() || null }
      : { titolo, descrizione: descrizione.trim() || null, categoria: categoria || null, sblocco_sequenziale: sblocco, visione_integrale: integrale, soglia_frequenza_percentuale: soglia.trim() || null };
    try {
      await call('PATCH', `/api/admin/corsi/${corso.id}`, body, { successo: frozen ? 'Descrizione salvata.' : 'Impostazioni salvate.', busy: setSalvando });
    } catch { /* banner */ }
  }

  async function uploadCover(file: File) {
    if (!file.type.startsWith('image/')) { setError("La copertina deve essere un'immagine (JPG o PNG)."); return; }
    setUploading(true);
    setBusy(true);
    setError(null);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${corso.tenant_id}/${corso.id}.${ext}`;
      const supabase = createSupabaseBrowserClient();
      const { error: upErr } = await supabase.storage.from('copertine').upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      await call('PATCH', `/api/admin/corsi/${corso.id}`, { cover_path: path }, { successo: 'Copertina aggiornata.' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      setBusy(false);
    }
  }

  const coverSrc = coverUrl(corso.cover_path);

  return (
    <form onSubmit={save} noValidate>
      <ErrorBanner error={error} />
      {frozen && (
        <div className="banner banner--freeze">
          <Icon name="lock" className="banner__icon" />
          <div className="banner__body">
            Il corso ha {nEdizioni} {nEdizioni === 1 ? 'edizione' : 'edizioni'}: <strong>titolo, categoria e regole di fruizione sono fissati</strong>, perché chi è iscritto deve seguire sempre lo stesso percorso.
            Descrizione e copertina restano modificabili. Per un corso diverso, duplica questo e lavora sulla copia.
          </div>
        </div>
      )}
      <div className="card">
        <div className="card__head"><h3>Dati del corso</h3></div>
        <div className="card__body">
          <div className="grid-2-380">
            <div>
              <Field id="corso-titolo" label="Titolo" required={!frozen} error={errTitolo}>
                <input id="corso-titolo" className="input" value={titolo} onChange={(e) => { setTitolo(e.target.value); if (errTitolo) setErrTitolo(null); }} disabled={busy || frozen} aria-invalid={Boolean(errTitolo)} />
              </Field>
              <Field id="corso-categoria" label="Categoria" hint={frozen ? undefined : <>L&apos;elenco si gestisce in <Link href="/admin/impostazioni/categorie">Impostazioni → Categorie</Link>.</>}>
                <select id="corso-categoria" className="select" value={categoria} onChange={(e) => setCategoria(e.target.value)} disabled={busy || frozen}>
                  <option value="">— nessuna —</option>
                  {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field id="corso-descrizione" label="Descrizione" hint="È il testo che il discente legge nella pagina del corso. Modificabile sempre.">
                <textarea id="corso-descrizione" className="textarea" rows={4} value={descrizione} onChange={(e) => setDescrizione(e.target.value)} disabled={busy} />
              </Field>
            </div>
            <div className="field">
              <label>Immagine di copertina</label>
              {coverSrc ? (
                <>
                  <div className="dropzone dropzone--filled" style={{ height: 180 }}>
                    <Cover src={coverSrc} categoria={corso.categoria} style={{ height: '100%' }} />
                  </div>
                  <div className="row" style={{ marginTop: 8 }}>
                    <button type="button" className="btn btn--secondary btn--sm" disabled={uploading} onClick={() => fileRef.current?.click()}><Icon name="upload" /> Sostituisci</button>
                    <button type="button" className="btn btn--danger btn--sm" disabled={uploading} onClick={() => call('PATCH', `/api/admin/corsi/${corso.id}`, { cover_path: null }, { successo: 'Copertina rimossa.' }).catch(() => { /* banner */ })}><Icon name="trash" /> Rimuovi</button>
                  </div>
                </>
              ) : (
                <div
                  className={`dropzone ${over ? 'is-over' : ''}`}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                  onDragLeave={() => setOver(false)}
                  onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) uploadCover(f); }}
                >
                  <Icon name="upload" className="dropzone__icon" />
                  <div className="dropzone__t">{uploading ? 'Carico…' : 'Trascina qui l’immagine di copertina'}</div>
                  <div className="dropzone__s">oppure clicca per selezionare · JPG o PNG</div>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCover(f); e.target.value = ''; }} />
              <div className="field__hint">Senza copertina si usa un segnaposto per categoria. Modificabile sempre.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__head"><div><h3>Regole di fruizione</h3><div className="sub">{frozen ? 'Fissate con la prima edizione.' : 'Si fissano con la prima edizione: scegli con attenzione.'}</div></div></div>
        <div className="card__body">
          <div className="row between" style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-ctrl)', padding: '12px 14px', background: 'var(--bg)' }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13 }}>Sblocco sequenziale</div>
              <div className="muted" style={{ fontSize: 12 }}>Le lezioni si aprono una dopo l&apos;altra, solo a completamento della precedente.</div>
            </div>
            <label className="switch">
              <input type="checkbox" checked={sblocco} onChange={(e) => setSblocco(e.target.checked)} disabled={busy || frozen} />
              <span className="switch__track" />
            </label>
          </div>
          <div className="row between" style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-ctrl)', padding: '12px 14px', background: 'var(--bg)', marginTop: 10 }}>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13 }}>Visione integrale dei video</div>
              <div className="muted" style={{ fontSize: 12 }}>Per i corsi finanziati: un video conta come completato solo se riprodotto davvero (almeno il 95%) e il discente non può saltare avanti. Spento = fruizione libera.</div>
            </div>
            <label className="switch">
              <input type="checkbox" checked={integrale} onChange={(e) => setIntegrale(e.target.checked)} disabled={busy || frozen} />
              <span className="switch__track" />
            </label>
          </div>
          <Field id="corso-soglia" className="field--spaced" label="Presenza minima alle sessioni (%)" error={errSoglia} hint="Per i corsi con sessioni live: sotto questa presenza il discente non completa il corso. Vuoto = nessun requisito.">
            <input id="corso-soglia" className="input" inputMode="decimal" value={soglia} onChange={(e) => { setSoglia(e.target.value); if (errSoglia) setErrSoglia(null); }} disabled={busy || frozen} placeholder="es. 80" style={{ maxWidth: 160 }} aria-invalid={Boolean(errSoglia)} />
          </Field>
          <div style={{ marginTop: 16 }}>
            <button type="submit" className="btn" disabled={busy || !dirty}>{salvando ? 'Salvo…' : 'Salva impostazioni'}</button>
          </div>
        </div>
      </div>
    </form>
  );
}
