'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  edizioneStato,
  type CorsoRow,
  type EdizioneRow,
  type LearningObjectRow,
  type StrutturaCorsoConLO,
} from '@/lib/db-types';
import { parseDelimited } from '@/lib/csv';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  Icon,
  Cover,
  coverUrl,
  fmtDurataSec,
  fmtData,
  regolaLabel,
} from '@/components/admin/Atlante';

export type IscrittoRow = {
  iscrizione_id: string;
  nome: string;
  cognome: string;
  email: string;
  codice_fiscale: string | null;
  azienda: string | null;
};

const CATEGORIE = ['Sicurezza', 'Privacy', 'Antincendio', 'Primo soccorso', 'Formazione'];

function parseMmSs(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t); // già secondi
  const m = t.match(/^(\d+):([0-5]?\d)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function CorsoEditor({
  corso,
  struttura,
  edizioni,
  availableLo,
  iscrittiByEdizione,
}: {
  corso: CorsoRow;
  struttura: StrutturaCorsoConLO[];
  edizioni: EdizioneRow[];
  availableLo: LearningObjectRow[];
  iscrittiByEdizione: Record<string, IscrittoRow[]>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // D22 — il Corso è congelato appena ha almeno un'Edizione.
  const frozen = edizioni.length > 0;

  async function call(method: string, url: string, body?: unknown): Promise<unknown> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.refresh();
      return json;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <span className="eyebrow">Modifica corso</span>
          <h1>{corso.titolo}</h1>
          <div className="row row--wrap" style={{ marginTop: 8 }}>
            <span className={`chip ${frozen ? 'chip--freeze' : 'chip--ocra'}`}>
              <span className="dot" />
              {frozen ? 'Congelato' : 'Bozza'}
            </span>
            <span className="metaline"><Icon name="layers" /> <span className="num">{struttura.length}</span> oggetti</span>
            <span className="metaline">
              <span className="num">{struttura.filter((s) => s.obbligatorio).length}</span> obbligatori
            </span>
          </div>
        </div>
        <div className="page-head__actions">
          <a className="btn btn--secondary" href="/admin/corsi"><Icon name="arrowLeft" /> Tutti i corsi</a>
        </div>
      </div>

      {error && (
        <div className="banner banner--err">
          <Icon name="alert" className="banner__icon" />
          <div className="banner__body">{error}</div>
        </div>
      )}

      {frozen && (
        <div className="banner banner--freeze">
          <Icon name="snowflake" className="banner__icon" />
          <div className="banner__body">
            <strong>Corso congelato.</strong> Ha {edizioni.length}{' '}
            {edizioni.length === 1 ? 'edizione' : 'edizioni'}: la struttura, i dati e gli oggetti
            didattici sono in <strong>sola lettura</strong> perché le persone già iscritte fruiscano
            sempre dello stesso percorso. L&apos;<strong>immagine di copertina resta modificabile</strong>.
          </div>
        </div>
      )}

      <SezioneDati corso={corso} frozen={frozen} busy={busy} call={call} onError={setError} onBusy={setBusy} />

      <SezioneStruttura struttura={struttura} frozen={frozen} busy={busy} call={call} corsoId={corso.id} />

      {!frozen && (
        <SezioneAggiungi
          corso={corso}
          struttura={struttura}
          availableLo={availableLo}
          busy={busy}
          call={call}
          onError={setError}
          onBusy={setBusy}
        />
      )}

      <SezioneEdizioni corsoId={corso.id} edizioni={edizioni} busy={busy} call={call} onError={setError} onBusy={setBusy} />

      <SezioneIscritti edizioni={edizioni} iscrittiByEdizione={iscrittiByEdizione} busy={busy} call={call} onError={setError} onBusy={setBusy} />
    </>
  );
}

type CallFn = (method: string, url: string, body?: unknown) => Promise<unknown>;
type ErrFn = (m: string | null) => void;
type BusyFn = (v: boolean) => void;

function SectionHead({ n, title, sub, right }: { n: number; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="card__head">
      <div>
        <div className="section-step">
          <span className="step-num">{n}</span>
          <h3>{title}</h3>
        </div>
        {sub && <div className="sub" style={{ marginLeft: 35 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

// ── Sezione 1 — Dati del corso (+ copertina) ────────────────────────────
function SezioneDati({
  corso,
  frozen,
  busy,
  call,
  onError,
  onBusy,
}: {
  corso: CorsoRow;
  frozen: boolean;
  busy: boolean;
  call: CallFn;
  onError: ErrFn;
  onBusy: BusyFn;
}) {
  const router = useRouter();
  const [titolo, setTitolo] = useState(corso.titolo);
  const [categoria, setCategoria] = useState(corso.categoria ?? '');
  const [descrizione, setDescrizione] = useState(corso.descrizione ?? '');
  const [sblocco, setSblocco] = useState(corso.sblocco_sequenziale);
  const [over, setOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty =
    !frozen &&
    (titolo.trim() !== corso.titolo ||
      (categoria || null) !== (corso.categoria ?? null) ||
      descrizione.trim() !== (corso.descrizione ?? '') ||
      sblocco !== corso.sblocco_sequenziale);

  const catOptions = useMemo(() => {
    const set = [...CATEGORIE];
    if (categoria && !set.includes(categoria)) set.push(categoria);
    return set;
  }, [categoria]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    await call('PATCH', `/api/admin/corsi/${corso.id}`, {
      titolo,
      descrizione: descrizione || null,
      categoria: categoria || null,
      sblocco_sequenziale: sblocco,
    });
  }

  async function uploadCover(file: File) {
    if (!file.type.startsWith('image/')) {
      onError('La copertina deve essere un&apos;immagine (JPG o PNG).');
      return;
    }
    setUploading(true);
    onBusy(true);
    onError(null);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${corso.tenant_id}/${corso.id}.${ext}`;
      const supabase = createSupabaseBrowserClient();
      const { error: upErr } = await supabase.storage
        .from('copertine')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      await call('PATCH', `/api/admin/corsi/${corso.id}`, { cover_path: path });
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      onBusy(false);
    }
  }

  async function removeCover() {
    await call('PATCH', `/api/admin/corsi/${corso.id}`, { cover_path: null });
    router.refresh();
  }

  const coverSrc = coverUrl(corso.cover_path);

  return (
    <form className="card" onSubmit={save}>
      <SectionHead n={1} title="Dati del corso" />
      <div className="card__body">
        <div className="grid-2-380">
          <div>
            <div className="field">
              <label>Titolo</label>
              <input className="input" value={titolo} onChange={(e) => setTitolo(e.target.value)} disabled={busy || frozen} />
            </div>
            <div className="field">
              <label>Categoria</label>
              <select className="select" value={categoria} onChange={(e) => setCategoria(e.target.value)} disabled={busy || frozen}>
                <option value="">— nessuna —</option>
                {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Descrizione</label>
              <textarea className="textarea" rows={3} value={descrizione} onChange={(e) => setDescrizione(e.target.value)} disabled={busy || frozen} />
            </div>
            <div className="row between" style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-ctrl)', padding: '12px 14px', background: 'var(--bg)' }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13 }}>Sblocco sequenziale</div>
                <div className="muted" style={{ fontSize: 12 }}>Gli oggetti si abilitano uno dopo l&apos;altro, solo a completamento del precedente.</div>
              </div>
              <label className="switch">
                <input type="checkbox" checked={sblocco} onChange={(e) => setSblocco(e.target.checked)} disabled={busy || frozen} />
                <span className="switch__track" />
              </label>
            </div>
          </div>

          <div className="field">
            <label>Immagine di copertina</label>
            {coverSrc ? (
              <>
                <div className="dropzone dropzone--filled" style={{ height: 180 }}>
                  <Cover src={coverSrc} categoria={corso.categoria} style={{ height: '100%' }} />
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button type="button" className="btn btn--secondary btn--sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                    <Icon name="upload" /> Sostituisci
                  </button>
                  <button type="button" className="btn btn--danger btn--sm" disabled={uploading} onClick={removeCover}>
                    <Icon name="trash" /> Rimuovi
                  </button>
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
            <div className="field__hint">In assenza di copertina si usa un segnaposto editoriale per categoria. La copertina è modificabile anche a corso congelato.</div>
          </div>
        </div>

        {!frozen && (
          <div style={{ marginTop: 14 }}>
            <button type="submit" className="btn" disabled={busy || !dirty}>{busy ? 'Salvo…' : 'Salva dati'}</button>
          </div>
        )}
      </div>
    </form>
  );
}

// ── Sezione 2 — Struttura (drag & drop) ─────────────────────────────────
function SezioneStruttura({
  struttura,
  frozen,
  busy,
  call,
  corsoId,
}: {
  struttura: StrutturaCorsoConLO[];
  frozen: boolean;
  busy: boolean;
  call: CallFn;
  corsoId: string;
}) {
  const serverIds = struttura.map((s) => s.id);
  const serverKey = serverIds.join(',');

  const [order, setOrder] = useState<string[]>(serverIds);
  const [drag, setDrag] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const lastKey = useRef(serverKey);

  // Riallinea l'ordine locale quando cambia la membership della struttura
  // (aggiunta/rimozione dal server) — pattern "adjust state during render".
  // Il riordino ottimistico resta comunque locale tra una refresh e l'altra.
  if (lastKey.current !== serverKey) {
    lastKey.current = serverKey;
    setOrder(serverIds);
  }

  const byId = new Map(struttura.map((s) => [s.id, s]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as StrutturaCorsoConLO[];
  const list = ordered.length === struttura.length ? ordered : struttura;

  async function commitOrder(newOrder: string[]) {
    setOrder(newOrder);
    try {
      await call('POST', `/api/admin/corsi/${corsoId}/struttura/reorder`, { ordered_struttura_ids: newOrder });
    } catch {
      setOrder(struttura.map((s) => s.id));
    }
  }

  function onDrop(targetId: string) {
    if (!drag || drag === targetId) { setDrag(null); setTarget(null); return; }
    const cur = [...order];
    const from = cur.indexOf(drag);
    const to = cur.indexOf(targetId);
    cur.splice(from, 1);
    cur.splice(to, 0, drag);
    setDrag(null);
    setTarget(null);
    commitOrder(cur);
  }

  async function toggleObbligatorio(s: StrutturaCorsoConLO) {
    await call('PATCH', `/api/admin/corsi/${corsoId}/struttura/${s.id}`, { obbligatorio: !s.obbligatorio });
  }
  async function remove(s: StrutturaCorsoConLO) {
    if (!confirm('Rimuovere questo oggetto dalla struttura?')) return;
    await call('DELETE', `/api/admin/corsi/${corsoId}/struttura/${s.id}`);
  }

  return (
    <div className="card">
      <SectionHead
        n={2}
        title="Struttura del corso"
        sub={frozen ? 'Sequenza in sola lettura (corso congelato).' : 'Trascina le righe per riordinare la sequenza degli oggetti didattici.'}
      />
      <div className="card__body">
        {list.length === 0 ? (
          <div className="empty">
            <Icon name="layers" className="empty__icon" />
            <div className="empty__t">Struttura vuota</div>
            <div className="empty__s">Aggiungi oggetti didattici dalla sezione qui sotto per comporre il percorso.</div>
          </div>
        ) : (
          list.map((s, i) => {
            const lo = s.learning_object;
            const tipo = lo?.type ?? 'video';
            const durata = tipo === 'video' ? fmtDurataSec(typeof lo?.config?.durata_secondi === 'number' ? (lo!.config.durata_secondi as number) : null) : null;
            return (
              <div
                key={s.id}
                className={`lo-row ${frozen ? 'is-readonly' : ''} ${drag === s.id ? 'is-dragging' : ''} ${target === s.id ? 'is-drop-target' : ''}`}
                draggable={!frozen && !busy}
                onDragStart={() => !frozen && setDrag(s.id)}
                onDragEnd={() => { setDrag(null); setTarget(null); }}
                onDragOver={(e) => { if (!frozen && drag) { e.preventDefault(); setTarget(s.id); } }}
                onDrop={() => onDrop(s.id)}
              >
                <span className="lo-grip"><Icon name="grip" /></span>
                <span className="lo-idx">{String(i + 1).padStart(2, '0')}</span>
                <div className="row" style={{ minWidth: 0 }}>
                  <span className={`type-ico type-ico--${tipo}`}><Icon name={tipo === 'video' ? 'video' : 'documento'} /></span>
                  <div className="lo-main">
                    <div className="lo-main__title">{lo?.titolo ?? '(oggetto rimosso)'}</div>
                    <div className="lo-main__meta">
                      <span className={`chip ${tipo === 'video' ? 'chip--teal' : 'chip--ocra'}`}>{tipo === 'video' ? 'Video' : 'PDF'}</span>
                      {durata && <span><Icon name="clock" style={{ width: 12, height: 12, verticalAlign: -2 }} /> {durata}</span>}
                      <span>· {regolaLabel(s.regola_completamento.tipo)}</span>
                    </div>
                  </div>
                </div>
                <div className="lo-actions">
                  <label className="switch" title={s.obbligatorio ? 'Obbligatorio' : 'Facoltativo'}>
                    <input type="checkbox" checked={s.obbligatorio} disabled={busy || frozen} onChange={() => toggleObbligatorio(s)} />
                    <span className="switch__track" />
                    <span className="switch__label">{s.obbligatorio ? 'Obbligatorio' : 'Facoltativo'}</span>
                  </label>
                  {!frozen && (
                    <button type="button" className="icon-btn" title="Rimuovi" disabled={busy} onClick={() => remove(s)}>
                      <Icon name="trash" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Sezione 3 — Aggiungi contenuto (manuale / da CSV) ───────────────────
type ImportStrutturaRow = {
  riga: number;
  titolo: string;
  tipo: 'video' | 'documento' | null;
  riferimento: string;
  durata: string;
  obbligatorio: boolean;
  esito: 'nuovo' | 'libreria' | 'errore';
  motivo?: string;
};

function matchCol(headers: string[], aliases: string[]): number {
  const norm = (s: string) => s.toLowerCase().trim().replace(/[\s_]+/g, ' ');
  const H = headers.map(norm);
  for (const a of aliases) { const i = H.indexOf(norm(a)); if (i >= 0) return i; }
  for (let i = 0; i < H.length; i++) { if (aliases.some((a) => H[i].includes(norm(a)))) return i; }
  return -1;
}

function SezioneAggiungi({
  corso,
  struttura,
  availableLo,
  busy,
  call,
  onError,
  onBusy,
}: {
  corso: CorsoRow;
  struttura: StrutturaCorsoConLO[];
  availableLo: LearningObjectRow[];
  busy: boolean;
  call: CallFn;
  onError: ErrFn;
  onBusy: BusyFn;
}) {
  const [mode, setMode] = useState<'manuale' | 'csv'>('manuale');

  return (
    <div className="card">
      <SectionHead
        n={3}
        title="Aggiungi contenuto"
        right={
          <div className="seg">
            <button type="button" className={mode === 'manuale' ? 'is-active' : ''} onClick={() => setMode('manuale')}>Manuale</button>
            <button type="button" className={mode === 'csv' ? 'is-active' : ''} onClick={() => setMode('csv')}>Da Excel/CSV</button>
          </div>
        }
      />
      <div className="card__body">
        {mode === 'manuale' ? (
          <AggiungiManuale corso={corso} availableLo={availableLo} busy={busy} call={call} onError={onError} onBusy={onBusy} />
        ) : (
          <AggiungiCsv corsoId={corso.id} availableLo={availableLo} struttura={struttura} busy={busy} call={call} />
        )}
      </div>
    </div>
  );
}

function AggiungiManuale({
  corso,
  availableLo,
  busy,
  call,
  onError,
  onBusy,
}: {
  corso: CorsoRow;
  availableLo: LearningObjectRow[];
  busy: boolean;
  call: CallFn;
  onError: ErrFn;
  onBusy: BusyFn;
}) {
  const [newType, setNewType] = useState<'video' | 'documento'>('video');
  const [titolo, setTitolo] = useState('');
  const [vimeo, setVimeo] = useState('');
  const [durata, setDurata] = useState('');
  const [pdf, setPdf] = useState<File | null>(null);
  const [q, setQ] = useState('');
  const pdfRef = useRef<HTMLInputElement>(null);

  const libFiltered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return availableLo.filter((lo) => !n || lo.titolo.toLowerCase().includes(n));
  }, [availableLo, q]);

  async function createAndAdd(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    if (!titolo.trim()) { onError('Titolo del contenuto mancante.'); return; }
    try {
      let config: Record<string, unknown>;
      if (newType === 'video') {
        const sec = parseMmSs(durata);
        if (!vimeo.trim()) { onError('ID Vimeo mancante.'); return; }
        if (sec == null || sec <= 0) { onError('Durata non valida (usa mm:ss).'); return; }
        config = { vimeo_id: vimeo.trim(), durata_secondi: sec };
      } else {
        if (!pdf) { onError('Seleziona un file PDF.'); return; }
        onBusy(true);
        const supabase = createSupabaseBrowserClient();
        const loId = crypto.randomUUID();
        const key = `${corso.tenant_id}/${loId}.pdf`;
        const { error: upErr } = await supabase.storage.from('documenti').upload(key, pdf, { upsert: true, contentType: 'application/pdf' });
        onBusy(false);
        if (upErr) { onError(upErr.message); return; }
        config = { storage_key: key, mime: 'application/pdf', size: pdf.size, filename: pdf.name };
      }
      const created = (await call('POST', '/api/admin/learning-objects', { type: newType, titolo: titolo.trim(), config })) as { learning_object: { id: string } };
      await call('POST', `/api/admin/corsi/${corso.id}/struttura`, { learning_object_id: created.learning_object.id });
      setTitolo(''); setVimeo(''); setDurata(''); setPdf(null);
    } catch {
      /* errore già mostrato da call */
    }
  }

  return (
    <div className="dual">
      <div className="dual__pane">
        <div className="dual__head"><Icon name="plus" style={{ width: 16, height: 16 }} /><h4>Crea nuovo</h4></div>
        <div className="seg seg--mono" style={{ marginBottom: 12 }}>
          <button type="button" className={newType === 'video' ? 'is-active' : ''} onClick={() => setNewType('video')}>Video</button>
          <button type="button" className={newType === 'documento' ? 'is-active' : ''} onClick={() => setNewType('documento')}>Documento</button>
        </div>
        <form onSubmit={createAndAdd}>
          <div className="field">
            <label>Titolo</label>
            <input className="input" value={titolo} onChange={(e) => setTitolo(e.target.value)} disabled={busy} placeholder="es. Concetti di rischio" />
          </div>
          {newType === 'video' ? (
            <div className="grid-2">
              <div className="field">
                <label>ID Vimeo</label>
                <input className="input" value={vimeo} onChange={(e) => setVimeo(e.target.value)} disabled={busy} placeholder="es. 824601551" />
              </div>
              <div className="field">
                <label>Durata (mm:ss)</label>
                <input className="input" value={durata} onChange={(e) => setDurata(e.target.value)} disabled={busy} placeholder="es. 12:40" />
              </div>
            </div>
          ) : (
            <div className="field">
              <label>File PDF</label>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => pdfRef.current?.click()} disabled={busy}>
                <Icon name="upload" /> {pdf ? pdf.name : 'Seleziona PDF'}
              </button>
              <input ref={pdfRef} type="file" accept="application/pdf" hidden onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
            </div>
          )}
          <button type="submit" className="btn" disabled={busy}>{busy ? 'Aggiungo…' : 'Crea e aggiungi'}</button>
        </form>
      </div>

      <div className="dual__pane">
        <div className="dual__head"><Icon name="libreria" style={{ width: 16, height: 16 }} /><h4>Aggiungi dalla libreria</h4></div>
        <div className="search" style={{ marginBottom: 10 }}>
          <Icon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca un contenuto…" />
        </div>
        {libFiltered.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>Nessun contenuto disponibile (tutti già in struttura o libreria vuota).</div>
        ) : (
          <div style={{ maxHeight: 280, overflow: 'auto' }}>
            {libFiltered.map((lo) => (
              <div key={lo.id} className="libitem">
                <span className={`type-ico type-ico--${lo.type}`}><Icon name={lo.type === 'video' ? 'video' : 'documento'} /></span>
                <div className="libitem__main">
                  <div className="libitem__title">{lo.titolo}</div>
                  <div className="libitem__meta">{lo.type === 'video' ? 'Video' : 'PDF'}</div>
                </div>
                <button type="button" className="btn btn--secondary btn--xs" disabled={busy} onClick={() => call('POST', `/api/admin/corsi/${corso.id}/struttura`, { learning_object_id: lo.id })}>
                  <Icon name="plus" /> Aggiungi
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AggiungiCsv({
  corsoId,
  availableLo,
  struttura,
  busy,
  call,
}: {
  corsoId: string;
  availableLo: LearningObjectRow[];
  struttura: StrutturaCorsoConLO[];
  busy: boolean;
  call: CallFn;
}) {
  const [rows, setRows] = useState<ImportStrutturaRow[]>([]);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const titlesInCourse = useMemo(() => new Set(struttura.map((s) => s.learning_object?.titolo?.toLowerCase().trim()).filter(Boolean)), [struttura]);
  const libByTitle = useMemo(() => new Map(availableLo.map((lo) => [lo.titolo.toLowerCase().trim(), lo])), [availableLo]);

  function parse(text: string) {
    try {
      const { headers, rows: raw } = parseDelimited(text);
      const ci = {
        titolo: matchCol(headers, ['titolo', 'title', 'nome', 'contenuto']),
        tipo: matchCol(headers, ['tipo', 'type']),
        riferimento: matchCol(headers, ['riferimento', 'vimeo', 'vimeo id', 'id', 'file', 'reference']),
        durata: matchCol(headers, ['durata', 'duration', 'durata mm ss', 'durata (mm:ss)']),
        obbligatorio: matchCol(headers, ['obbligatorio', 'mandatory', 'required']),
      };
      const out: ImportStrutturaRow[] = raw.map((r, idx) => {
        const titolo = (ci.titolo >= 0 ? r[ci.titolo] : '')?.trim() ?? '';
        const tipoRaw = (ci.tipo >= 0 ? r[ci.tipo] : '')?.toLowerCase().trim() ?? '';
        const tipo: 'video' | 'documento' | null = tipoRaw.startsWith('vid') ? 'video' : tipoRaw.startsWith('doc') || tipoRaw.includes('pdf') ? 'documento' : null;
        const riferimento = (ci.riferimento >= 0 ? r[ci.riferimento] : '')?.trim() ?? '';
        const durata = (ci.durata >= 0 ? r[ci.durata] : '')?.trim() ?? '';
        const obbS = (ci.obbligatorio >= 0 ? r[ci.obbligatorio] : '')?.toLowerCase().trim() ?? '';
        const obbligatorio = !['no', 'false', '0', 'facoltativo', 'n'].includes(obbS);
        let esito: ImportStrutturaRow['esito'] = 'nuovo';
        let motivo: string | undefined;
        const key = titolo.toLowerCase();
        if (!titolo) { esito = 'errore'; motivo = 'titolo mancante'; }
        else if (titlesInCourse.has(key)) { esito = 'errore'; motivo = 'già nel corso'; }
        else if (libByTitle.has(key)) { esito = 'libreria'; }
        else if (!tipo) { esito = 'errore'; motivo = 'tipo non riconosciuto'; }
        else if (tipo === 'video' && (!riferimento || parseMmSs(durata) == null)) { esito = 'errore'; motivo = 'video: ID/durata mancanti'; }
        return { riga: idx + 1, titolo, tipo, riferimento, durata, obbligatorio, esito, motivo };
      });
      setRows(out);
    } catch (e) {
      setRows([]);
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  const importabili = rows.filter((r) => r.esito !== 'errore');

  async function importa() {
    await call('POST', `/api/admin/corsi/${corsoId}/struttura/import`, {
      rows: importabili.map((r) => ({
        titolo: r.titolo,
        tipo: r.tipo,
        riferimento: r.riferimento || null,
        durata_secondi: r.tipo === 'video' ? parseMmSs(r.durata) : null,
        obbligatorio: r.obbligatorio,
      })),
    });
    setRows([]);
  }

  return (
    <>
      <div
        className={`dropzone ${over ? 'is-over' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) f.text().then(parse); }}
      >
        <Icon name="upload" className="dropzone__icon" />
        <div className="dropzone__t">Trascina qui un file .csv</div>
        <div className="dropzone__s">colonne: Titolo, Tipo, Riferimento, Durata (mm:ss), Obbligatorio · da Excel: salva come CSV</div>
      </div>
      <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(parse); e.target.value = ''; }} />

      {rows.length > 0 && (
        <div className="import-preview">
          <table className="tbl">
            <thead><tr><th>#</th><th>Titolo</th><th>Tipo</th><th>Esito</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.riga}>
                  <td className="mono">{r.riga}</td>
                  <td>{r.titolo || <span className="muted">—</span>}</td>
                  <td>{r.tipo ? (r.tipo === 'video' ? 'Video' : 'PDF') : '—'}</td>
                  <td>
                    {r.esito === 'errore' ? <span className="chip chip--err">Errore · {r.motivo}</span>
                      : r.esito === 'libreria' ? <span className="chip chip--teal">Dalla libreria</span>
                      : <span className="chip chip--ocra">Nuovo contenuto</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="row" style={{ marginTop: 14 }}>
          <button type="button" className="btn" disabled={busy || importabili.length === 0} onClick={importa}>
            Importa {importabili.length} {importabili.length === 1 ? 'oggetto' : 'oggetti'}
          </button>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setRows([])}>Annulla</button>
        </div>
      )}
    </>
  );
}

// ── Sezione 4 — Edizioni ────────────────────────────────────────────────
function SezioneEdizioni({
  corsoId,
  edizioni,
  busy,
  call,
  onError,
  onBusy,
}: {
  corsoId: string;
  edizioni: EdizioneRow[];
  busy: boolean;
  call: CallFn;
  onError: ErrFn;
  onBusy: BusyFn;
}) {
  const [codice, setCodice] = useState('');
  const [di, setDi] = useState('');
  const [df, setDf] = useState('');

  async function create(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    onBusy(true);
    try {
      const res = await fetch(`/api/admin/corsi/${corsoId}/edizioni`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ codice, data_inizio: di || null, data_fine: df || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setCodice(''); setDi(''); setDf('');
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      onBusy(false);
    }
  }

  return (
    <div className="card">
      <SectionHead n={4} title="Edizioni" sub="La creazione della prima edizione congela il corso e la sua struttura." />
      <div className="card__body">
        {edizioni.length === 0 ? (
          <div className="muted" style={{ marginBottom: 14, fontSize: 13 }}>Nessuna edizione ancora creata.</div>
        ) : (
          <table className="tbl" style={{ marginBottom: 16 }}>
            <thead><tr><th>Codice</th><th>Stato</th><th>Date operative</th><th>Finestra FAD</th><th></th></tr></thead>
            <tbody>
              {edizioni.map((e) => {
                const stato = edizioneStato(e);
                return (
                  <tr key={e.id}>
                    <td className="mono">{e.codice}</td>
                    <td>
                      <span className={`chip ${stato === 'attiva' ? 'chip--teal' : stato === 'conclusa' ? 'chip--muted' : 'chip--err'}`}>
                        {stato === 'attiva' && <span className="dot" />}{stato}
                      </span>
                    </td>
                    <td className="muted">{fmtData(e.data_inizio)} → {fmtData(e.data_fine)}</td>
                    <td className="muted">{fmtData(e.fad_apertura)} → {fmtData(e.fad_chiusura)}</td>
                    <td>
                      <div className="row">
                        <button type="button" className="btn btn--ghost btn--xs" disabled={busy || stato !== 'attiva'} onClick={() => { if (confirm('Concludere questa edizione?')) call('POST', `/api/admin/edizioni/${e.id}/concludi`); }}>Concludi</button>
                        <button type="button" className="btn btn--danger btn--xs" disabled={busy || stato === 'annullata'} onClick={() => { if (confirm('Annullare questa edizione?')) call('POST', `/api/admin/edizioni/${e.id}/annulla`); }}>Annulla</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <form onSubmit={create} style={{ borderTop: '1px dashed var(--line)', paddingTop: 14 }}>
          <h4 style={{ margin: '0 0 12px' }}>Nuova edizione</h4>
          <div className="grid-3">
            <div className="field">
              <label>Codice</label>
              <input className="input" value={codice} onChange={(e) => setCodice(e.target.value)} disabled={busy} placeholder="es. ED-2026-01" required />
            </div>
            <div className="field">
              <label>Inizio</label>
              <input className="input" type="date" value={di} onChange={(e) => setDi(e.target.value)} disabled={busy} />
            </div>
            <div className="field">
              <label>Fine</label>
              <input className="input" type="date" value={df} onChange={(e) => setDf(e.target.value)} disabled={busy} />
            </div>
          </div>
          <button type="submit" className="btn" disabled={busy}>{busy ? 'Creo…' : 'Crea edizione'}</button>
        </form>
      </div>
    </div>
  );
}

// ── Sezione 5 — Iscritti ────────────────────────────────────────────────
type ImportIscrittoRow = {
  riga: number;
  cognome: string;
  nome: string;
  email: string;
  codice_fiscale: string;
  azienda: string;
  esito: 'nuovo' | 'duplicato' | 'errore';
  motivo?: string;
};

function SezioneIscritti({
  edizioni,
  iscrittiByEdizione,
  busy,
  call,
  onError,
  onBusy,
}: {
  edizioni: EdizioneRow[];
  iscrittiByEdizione: Record<string, IscrittoRow[]>;
  busy: boolean;
  call: CallFn;
  onError: ErrFn;
  onBusy: BusyFn;
}) {
  const attive = edizioni;
  const [selId, setSelId] = useState<string>(attive[0]?.id ?? '');
  const sel = attive.find((e) => e.id === selId) ?? attive[0];
  const iscritti = sel ? iscrittiByEdizione[sel.id] ?? [] : [];

  const [mode, setMode] = useState<'manuale' | 'csv'>('manuale');

  if (edizioni.length === 0) {
    return (
      <div className="card">
        <SectionHead n={5} title="Iscritti" sub="Le persone si iscrivono a una specifica edizione del corso." />
        <div className="card__body">
          <div className="empty">
            <Icon name="users" className="empty__icon" />
            <div className="empty__t">Nessuna edizione</div>
            <div className="empty__s">Crea prima un&apos;edizione (sezione 4): le iscrizioni appartengono a un&apos;edizione, non al corso.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <SectionHead
        n={5}
        title="Iscritti"
        sub="Le persone si iscrivono a una specifica edizione del corso."
        right={sel ? <span className="chip chip--muted">{iscritti.length} su {sel.codice}</span> : null}
      />
      <div className="card__body">
        {attive.length > 1 && (
          <div className="row" style={{ marginBottom: 14 }}>
            <span className="filterset__label">Edizione</span>
            <div className="seg seg--mono">
              {attive.map((e) => (
                <button key={e.id} type="button" className={e.id === selId ? 'is-active' : ''} onClick={() => setSelId(e.id)}>{e.codice}</button>
              ))}
            </div>
          </div>
        )}

        {iscritti.length === 0 ? (
          <div className="muted" style={{ marginBottom: 16, fontSize: 13 }}>Nessun iscritto su questa edizione.</div>
        ) : (
          <table className="tbl tbl--zebra" style={{ marginBottom: 16 }}>
            <thead><tr><th>Cognome e nome</th><th>Email</th><th>Codice fiscale</th><th>Azienda</th><th></th></tr></thead>
            <tbody>
              {iscritti.map((i) => (
                <tr key={i.iscrizione_id}>
                  <td className="t-title">{i.cognome} {i.nome}</td>
                  <td className="muted">{i.email}</td>
                  <td className="mono">{i.codice_fiscale ?? <span className="chip chip--err">assente</span>}</td>
                  <td>{i.azienda ?? <span className="muted">—</span>}</td>
                  <td>
                    <button type="button" className="icon-btn" title="Rimuovi iscritto" disabled={busy} onClick={() => { if (confirm(`Rimuovere ${i.cognome} ${i.nome} dall'edizione?`)) call('DELETE', `/api/admin/iscrizioni/${i.iscrizione_id}`); }}>
                      <Icon name="trash" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="between row" style={{ borderTop: '1px dashed var(--line)', paddingTop: 14, marginBottom: 12 }}>
          <h4 style={{ margin: 0 }}>Aggiungi iscritti{sel ? ` a ${sel.codice}` : ''}</h4>
          <div className="seg">
            <button type="button" className={mode === 'manuale' ? 'is-active' : ''} onClick={() => setMode('manuale')}>Manuale</button>
            <button type="button" className={mode === 'csv' ? 'is-active' : ''} onClick={() => setMode('csv')}>Da Excel/CSV</button>
          </div>
        </div>

        {sel && (mode === 'manuale' ? (
          <IscrittoManuale edizioneId={sel.id} busy={busy} call={call} onError={onError} />
        ) : (
          <IscrittiCsv edizioneId={sel.id} esistenti={iscritti} busy={busy} call={call} onBusy={onBusy} />
        ))}
      </div>
    </div>
  );
}

function IscrittoManuale({
  edizioneId,
  busy,
  call,
  onError,
}: {
  edizioneId: string;
  busy: boolean;
  call: CallFn;
  onError: ErrFn;
}) {
  const [cognome, setCognome] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [cf, setCf] = useState('');
  const [azienda, setAzienda] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    if (!cognome.trim() || !nome.trim() || !email.trim()) { onError('Cognome, nome ed email sono obbligatori.'); return; }
    try {
      await call('POST', `/api/admin/edizioni/${edizioneId}/iscritti`, {
        cognome: cognome.trim(), nome: nome.trim(), email: email.trim(),
        codice_fiscale: cf.trim() || null, azienda: azienda.trim() || null,
      });
      setCognome(''); setNome(''); setEmail(''); setCf(''); setAzienda('');
    } catch { /* mostrato da call */ }
  }

  return (
    <form onSubmit={submit}>
      <div className="grid-3">
        <div className="field"><label>Cognome</label><input className="input" value={cognome} onChange={(e) => setCognome(e.target.value)} disabled={busy} placeholder="es. Bianchi" /></div>
        <div className="field"><label>Nome</label><input className="input" value={nome} onChange={(e) => setNome(e.target.value)} disabled={busy} placeholder="es. Marco" /></div>
        <div className="field"><label>Email</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} placeholder="nome@azienda.it" /></div>
      </div>
      <div className="grid-2">
        <div className="field"><label>Codice fiscale</label><input className="input mono" value={cf} onChange={(e) => setCf(e.target.value)} disabled={busy} placeholder="RSSMRC80A01H501X" /></div>
        <div className="field"><label>Azienda</label><input className="input" value={azienda} onChange={(e) => setAzienda(e.target.value)} disabled={busy} placeholder="Ragione sociale" /></div>
      </div>
      <button type="submit" className="btn" disabled={busy}><Icon name="plus" /> Aggiungi iscritto</button>
    </form>
  );
}

function IscrittiCsv({
  edizioneId,
  esistenti,
  busy,
  call,
  onBusy,
}: {
  edizioneId: string;
  esistenti: IscrittoRow[];
  busy: boolean;
  call: CallFn;
  onBusy: BusyFn;
}) {
  const [rows, setRows] = useState<ImportIscrittoRow[]>([]);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const emails = useMemo(() => new Set(esistenti.map((i) => i.email.toLowerCase().trim()).filter(Boolean)), [esistenti]);
  const cfs = useMemo(() => new Set(esistenti.map((i) => i.codice_fiscale?.toLowerCase().trim()).filter(Boolean)), [esistenti]);

  function parse(text: string) {
    try {
      const { headers, rows: raw } = parseDelimited(text);
      const ci = {
        cognome: matchCol(headers, ['cognome', 'surname', 'last name']),
        nome: matchCol(headers, ['nome', 'name', 'first name']),
        email: matchCol(headers, ['email', 'e-mail', 'indirizzo email']),
        cf: matchCol(headers, ['codice fiscale', 'cf', 'codice_fiscale', 'fiscal code']),
        azienda: matchCol(headers, ['azienda', 'ragione sociale', 'company', 'datore']),
      };
      const seenEmail = new Set<string>();
      const seenCf = new Set<string>();
      const out: ImportIscrittoRow[] = raw.map((r, idx) => {
        const cognome = (ci.cognome >= 0 ? r[ci.cognome] : '')?.trim() ?? '';
        const nome = (ci.nome >= 0 ? r[ci.nome] : '')?.trim() ?? '';
        const email = (ci.email >= 0 ? r[ci.email] : '')?.trim() ?? '';
        const cf = (ci.cf >= 0 ? r[ci.cf] : '')?.trim() ?? '';
        const azienda = (ci.azienda >= 0 ? r[ci.azienda] : '')?.trim() ?? '';
        let esito: ImportIscrittoRow['esito'] = 'nuovo';
        let motivo: string | undefined;
        const ek = email.toLowerCase(); const ck = cf.toLowerCase();
        if (!cognome || !nome || !email) { esito = 'errore'; motivo = 'cognome/nome/email mancanti'; }
        else if (emails.has(ek) || (ck && cfs.has(ck)) || seenEmail.has(ek) || (ck && seenCf.has(ck))) { esito = 'duplicato'; motivo = 'già iscritto'; }
        if (esito === 'nuovo') { seenEmail.add(ek); if (ck) seenCf.add(ck); }
        return { riga: idx + 1, cognome, nome, email, codice_fiscale: cf, azienda, esito, motivo };
      });
      setRows(out);
    } catch (e) {
      setRows([]);
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  const importabili = rows.filter((r) => r.esito === 'nuovo');

  async function importa() {
    onBusy(true);
    try {
      await call('POST', `/api/admin/edizioni/${edizioneId}/iscritti/import`, {
        rows: importabili.map((r) => ({
          cognome: r.cognome, nome: r.nome, email: r.email,
          codice_fiscale: r.codice_fiscale || null, azienda: r.azienda || null,
        })),
      });
      setRows([]);
    } catch { /* mostrato */ } finally { onBusy(false); }
  }

  return (
    <>
      <div
        className={`dropzone ${over ? 'is-over' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) f.text().then(parse); }}
      >
        <Icon name="upload" className="dropzone__icon" />
        <div className="dropzone__t">Trascina qui un file .csv</div>
        <div className="dropzone__s">colonne: Cognome, Nome, Email, Codice fiscale, Azienda · da Excel: salva come CSV</div>
      </div>
      <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(parse); e.target.value = ''; }} />

      {rows.length > 0 && (
        <div className="import-preview">
          <table className="tbl">
            <thead><tr><th>#</th><th>Cognome e nome</th><th>Email</th><th>Esito</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.riga}>
                  <td className="mono">{r.riga}</td>
                  <td>{r.cognome} {r.nome}</td>
                  <td className="muted">{r.email || '—'}</td>
                  <td>
                    {r.esito === 'errore' ? <span className="chip chip--err">Errore · {r.motivo}</span>
                      : r.esito === 'duplicato' ? <span className="chip chip--muted">Duplicato · ignorato</span>
                      : <span className="chip chip--teal">Nuovo</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="row" style={{ marginTop: 14 }}>
          <button type="button" className="btn" disabled={busy || importabili.length === 0} onClick={importa}>
            Importa {importabili.length} {importabili.length === 1 ? 'iscritto' : 'iscritti'}
          </button>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setRows([])}>Annulla</button>
        </div>
      )}
    </>
  );
}
