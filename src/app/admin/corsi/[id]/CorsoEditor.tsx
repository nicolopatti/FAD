'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  edizioneStato,
  type CorsoRow,
  type EdizioneRow,
  type LearningObjectRow,
  type LearningObjectType,
  type PoliticaAttestato,
  type StrutturaCorsoConLO,
} from '@/lib/db-types';
import { parseDelimited } from '@/lib/csv';
import { useFeedback } from '@/components/ui/Feedback';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  Icon,
  Cover,
  coverUrl,
  fmtDurataSec,
  fmtData,
  regolaLabel,
} from '@/components/admin/Atlante';
import { Field, Pager } from '@/components/admin/Form';
import { isEmail, isCodiceFiscale, parseMmSs, dataDopo, type Errori } from '@/lib/validazione';

export type IscrittoRow = {
  iscrizione_id: string;
  nome: string;
  cognome: string;
  email: string;
  codice_fiscale: string | null;
  azienda: string | null;
  piano_id: string | null;
  piano_titolo: string | null;
  /** Attestato valido (Fase 5), se emesso. */
  attestato: { id: string; numero: string; emesso_at: string } | null;
};

const POLITICHE: [PoliticaAttestato, string, string][] = [
  ['automatica', 'Automatico', 'Si emette da solo appena il percorso è completato (e il test superato).'],
  ['manuale', 'Manuale', 'Lo emette l’amministratore dalla sezione Iscritti, dopo i controlli del caso.'],
  ['nessuna', 'Nessuno', 'Il corso non rilascia attestati.'],
];

export type PianoMini = { id: string; titolo: string; codice: string | null; fondo: string | null };

const CATEGORIE = ['Sicurezza', 'Privacy', 'Antincendio', 'Primo soccorso', 'Formazione'];
const TIPO_LABEL: Record<LearningObjectType, string> = { video: 'Video', documento: 'PDF', quiz: 'Test' };
const TIPO_CHIP: Record<LearningObjectType, string> = { video: 'chip--teal', documento: 'chip--ocra', quiz: 'chip--accent' };
const TIPO_ICON: Record<LearningObjectType, string> = { video: 'video', documento: 'documento', quiz: 'quiz' };

export function CorsoEditor({
  corso,
  struttura,
  edizioni,
  availableLo,
  iscrittiByEdizione,
  piani,
}: {
  corso: CorsoRow;
  struttura: StrutturaCorsoConLO[];
  edizioni: EdizioneRow[];
  availableLo: LearningObjectRow[];
  iscrittiByEdizione: Record<string, IscrittoRow[]>;
  piani: PianoMini[];
}) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicando, setDuplicando] = useState(false);

  // "Duplica corso": nuovo corso in bozza con stessi dati e struttura, senza
  // edizioni né iscritti. Utile per ripartire da un corso congelato.
  async function duplica() {
    const ok = await confirm({
      titolo: 'Duplicare questo corso?',
      messaggio: <>Viene creato un nuovo corso <strong>in bozza</strong> con gli stessi dati e la stessa sequenza di lezioni (che restano condivise nella libreria). Edizioni e iscritti non vengono copiati.</>,
      conferma: 'Duplica',
    });
    if (!ok) return;
    try {
      const res = (await call('POST', `/api/admin/corsi/${corso.id}/duplica`, undefined, { busy: setDuplicando })) as { corso: { id: string } };
      toast('Corso duplicato: sei nella copia, in bozza.');
      router.push(`/admin/corsi/${res.corso.id}`);
    } catch {
      /* errore già mostrato */
    }
  }

  // D22 — il Corso è congelato appena ha almeno un'Edizione.
  const frozen = edizioni.length > 0;

  // `busy` globale disabilita i controlli; `opts.busy` è lo stato locale del
  // pulsante premuto (prima tutte le etichette diventavano "Salvo…" insieme).
  async function call(method: string, url: string, body?: unknown, opts?: CallOpts): Promise<unknown> {
    setBusy(true);
    opts?.busy?.(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.refresh();
      if (opts?.successo) toast(opts.successo);
      return json;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setBusy(false);
      opts?.busy?.(false);
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
          <Link className="btn btn--ghost" href="/admin/corsi"><Icon name="arrowLeft" /> Tutti i corsi</Link>
          <button type="button" className="btn btn--secondary" disabled={busy} onClick={duplica} title="Crea una copia in bozza di questo corso">
            <Icon name="copy" /> {duplicando ? 'Duplico…' : 'Duplica corso'}
          </button>
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
            {edizioni.length === 1 ? 'edizione' : 'edizioni'}: titolo, categoria, regole di fruizione, struttura e oggetti
            didattici sono in <strong>sola lettura</strong> perché le persone già iscritte fruiscano
            sempre dello stesso percorso. <strong>Descrizione e immagine di copertina restano modificabili</strong>.
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

      <SezioneIscritti edizioni={edizioni} iscrittiByEdizione={iscrittiByEdizione} piani={piani} politicaAttestato={corso.politica_attestato ?? 'automatica'} busy={busy} call={call} onBusy={setBusy} />
    </>
  );
}

type CallOpts = { successo?: string; busy?: BusyFn };
type CallFn = (method: string, url: string, body?: unknown, opts?: CallOpts) => Promise<unknown>;
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
  const [salvando, setSalvando] = useState(false);
  const [errTitolo, setErrTitolo] = useState<string | null>(null);
  const router = useRouter();
  const [titolo, setTitolo] = useState(corso.titolo);
  const [categoria, setCategoria] = useState(corso.categoria ?? '');
  const [descrizione, setDescrizione] = useState(corso.descrizione ?? '');
  const [sblocco, setSblocco] = useState(corso.sblocco_sequenziale);
  const [integrale, setIntegrale] = useState(Boolean(corso.visione_integrale));
  const oreIniziali = corso.ore_totali != null ? String(corso.ore_totali).replace('.', ',') : '';
  const [ore, setOre] = useState(oreIniziali);
  const [riferimento, setRiferimento] = useState(corso.riferimento_normativo ?? '');
  const [politica, setPolitica] = useState<PoliticaAttestato>(corso.politica_attestato ?? 'automatica');
  const [over, setOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // A corso congelato (D22) restano modificabili la descrizione, la copertina
  // e — solo se ancora vuoti — ore totali e riferimento normativo (dati
  // dell'attestato): il trigger DB rifiuta tutto il resto.
  const oreEditabile = !frozen || corso.ore_totali == null;
  const riferimentoEditabile = !frozen || !corso.riferimento_normativo;
  const descrizioneDirty = descrizione.trim() !== (corso.descrizione ?? '');
  const oreDirty = oreEditabile && ore.trim() !== oreIniziali;
  const riferimentoDirty = riferimentoEditabile && riferimento.trim() !== (corso.riferimento_normativo ?? '');
  const dirty = frozen
    ? descrizioneDirty || oreDirty || riferimentoDirty
    : titolo.trim() !== corso.titolo ||
      (categoria || null) !== (corso.categoria ?? null) ||
      descrizioneDirty ||
      sblocco !== corso.sblocco_sequenziale ||
      integrale !== Boolean(corso.visione_integrale) ||
      oreDirty || riferimentoDirty ||
      politica !== (corso.politica_attestato ?? 'automatica');

  const catOptions = useMemo(() => {
    const set = [...CATEGORIE];
    if (categoria && !set.includes(categoria)) set.push(categoria);
    return set;
  }, [categoria]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    if (!frozen && !titolo.trim()) { setErrTitolo('Il titolo è obbligatorio.'); return; }
    setErrTitolo(null);
    const oreNum = ore.trim() ? Number(ore.trim().replace(',', '.')) : null;
    if (ore.trim() && (!Number.isFinite(oreNum) || (oreNum as number) <= 0)) { onError('Le ore totali devono essere un numero maggiore di zero (es. 8 o 2,5).'); return; }
    const attestatoBody = {
      ...(oreDirty ? { ore_totali: oreNum } : {}),
      ...(riferimentoDirty ? { riferimento_normativo: riferimento.trim() || null } : {}),
    };
    const body = frozen
      ? { descrizione: descrizione.trim() || null, ...attestatoBody }
      : {
          titolo,
          descrizione: descrizione.trim() || null,
          categoria: categoria || null,
          sblocco_sequenziale: sblocco,
          visione_integrale: integrale,
          politica_attestato: politica,
          ...attestatoBody,
        };
    await call('PATCH', `/api/admin/corsi/${corso.id}`, body, {
      successo: frozen ? 'Dati salvati.' : 'Dati del corso salvati.',
      busy: setSalvando,
    });
  }

  async function uploadCover(file: File) {
    if (!file.type.startsWith('image/')) {
      onError("La copertina deve essere un'immagine (JPG o PNG).");
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
      await call('PATCH', `/api/admin/corsi/${corso.id}`, { cover_path: path }, { successo: 'Copertina aggiornata.' });
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      onBusy(false);
    }
  }

  async function removeCover() {
    await call('PATCH', `/api/admin/corsi/${corso.id}`, { cover_path: null }, { successo: 'Copertina rimossa.' });
    router.refresh();
  }

  const coverSrc = coverUrl(corso.cover_path);

  return (
    <form className="card" onSubmit={save}>
      <SectionHead n={1} title="Dati del corso" />
      <div className="card__body">
        <div className="grid-2-380">
          <div>
            <Field id="corso-titolo" label="Titolo" required={!frozen} error={errTitolo}>
              <input id="corso-titolo" className="input" value={titolo} onChange={(e) => { setTitolo(e.target.value); if (errTitolo) setErrTitolo(null); }} disabled={busy || frozen} aria-invalid={Boolean(errTitolo)} />
            </Field>
            <Field id="corso-categoria" label="Categoria">
              <select id="corso-categoria" className="select" value={categoria} onChange={(e) => setCategoria(e.target.value)} disabled={busy || frozen}>
                <option value="">— nessuna —</option>
                {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field id="corso-descrizione" label="Descrizione" hint="È il testo che il discente legge nella pagina del corso. Si può aggiornare anche a corso congelato.">
              <textarea id="corso-descrizione" className="textarea" rows={3} value={descrizione} onChange={(e) => setDescrizione(e.target.value)} disabled={busy} />
            </Field>
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

            <h4 style={{ margin: '18px 0 8px' }}>Attestato</h4>
            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
              <Field id="corso-ore" label="Ore totali" hint={frozen && !oreEditabile ? 'Congelato con la prima edizione.' : 'Compaiono sull’attestato (es. 8 o 2,5).'}>
                <input id="corso-ore" className="input" inputMode="decimal" value={ore} onChange={(e) => setOre(e.target.value)} disabled={busy || !oreEditabile} placeholder="es. 8" />
              </Field>
              <Field id="corso-rif" label="Riferimento normativo" hint={frozen && !riferimentoEditabile ? 'Congelato con la prima edizione.' : 'Facoltativo, es. Accordo Stato-Regioni 21/12/2011.'}>
                <input id="corso-rif" className="input" value={riferimento} onChange={(e) => setRiferimento(e.target.value)} disabled={busy || !riferimentoEditabile} placeholder="es. Accordo Stato-Regioni 21/12/2011" />
              </Field>
            </div>
            <Field id="corso-politica" label="Rilascio dell’attestato" hint={frozen ? 'Congelato con la prima edizione.' : POLITICHE.find((p) => p[0] === politica)?.[2]}>
              <select id="corso-politica" className="select" value={politica} onChange={(e) => setPolitica(e.target.value as PoliticaAttestato)} disabled={busy || frozen}>
                {POLITICHE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
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

        <div style={{ marginTop: 14 }}>
          <button type="submit" className="btn" disabled={busy || !dirty}>
            {salvando ? 'Salvo…' : frozen ? 'Salva modifiche' : 'Salva dati'}
          </button>
        </div>
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
  const { confirm } = useFeedback();
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
    const cur = list.map((s) => s.id);
    const from = cur.indexOf(drag);
    const to = cur.indexOf(targetId);
    cur.splice(from, 1);
    cur.splice(to, 0, drag);
    setDrag(null);
    setTarget(null);
    commitOrder(cur);
  }

  // Riordino senza mouse: pulsanti su/giù e frecce da tastiera sulla maniglia.
  function sposta(id: string, dir: -1 | 1) {
    if (frozen || busy) return;
    const cur = list.map((s) => s.id);
    const i = cur.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cur.length) return;
    cur.splice(i, 1);
    cur.splice(j, 0, id);
    commitOrder(cur);
  }

  async function toggleObbligatorio(s: StrutturaCorsoConLO) {
    await call('PATCH', `/api/admin/corsi/${corsoId}/struttura/${s.id}`, { obbligatorio: !s.obbligatorio });
  }
  async function remove(s: StrutturaCorsoConLO) {
    const ok = await confirm({
      titolo: 'Togliere questa lezione dal corso?',
      messaggio: <><strong>{s.learning_object?.titolo ?? 'La lezione'}</strong> resta nella libreria dei contenuti: viene tolta solo da questo corso.</>,
      conferma: 'Togli dal corso',
      pericolosa: true,
    });
    if (!ok) return;
    await call('DELETE', `/api/admin/corsi/${corsoId}/struttura/${s.id}`, undefined, { successo: 'Lezione tolta dal corso.' });
  }

  return (
    <div className="card">
      <SectionHead
        n={2}
        title="Struttura del corso"
        sub={frozen ? 'Sequenza in sola lettura (corso congelato).' : 'Riordina trascinando le righe, con i pulsanti su/giù o con le frecce da tastiera sulla maniglia.'}
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
            const soglia = tipo === 'quiz' && typeof lo?.config?.soglia_percentuale === 'number' ? (lo!.config.soglia_percentuale as number) : null;
            return (
              <div
                key={s.id}
                className={`struct-row ${frozen ? 'is-readonly' : ''} ${drag === s.id ? 'is-dragging' : ''} ${target === s.id ? 'is-drop-target' : ''}`}
                draggable={!frozen && !busy}
                onDragStart={() => !frozen && setDrag(s.id)}
                onDragEnd={() => { setDrag(null); setTarget(null); }}
                onDragOver={(e) => { if (!frozen && drag) { e.preventDefault(); setTarget(s.id); } }}
                onDrop={() => onDrop(s.id)}
              >
                <button
                  type="button"
                  className="lo-grip"
                  aria-label={`Sposta "${lo?.titolo ?? 'lezione'}": frecce su e giù`}
                  title="Trascina, oppure usa le frecce ↑ ↓ da tastiera"
                  disabled={frozen || busy}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp') { e.preventDefault(); sposta(s.id, -1); }
                    else if (e.key === 'ArrowDown') { e.preventDefault(); sposta(s.id, 1); }
                  }}
                >
                  <Icon name="grip" />
                </button>
                <span className="lo-idx">{String(i + 1).padStart(2, '0')}</span>
                <div className="row" style={{ minWidth: 0 }}>
                  <span className={`type-ico type-ico--${tipo}`}><Icon name={TIPO_ICON[tipo]} /></span>
                  <div className="lo-main">
                    <div className="lo-main__title">
                      {tipo === 'quiz' ? <Link href={`/admin/learning-objects/${s.learning_object_id}`} title="Apri le domande del test">{lo?.titolo ?? '(oggetto rimosso)'}</Link> : (lo?.titolo ?? '(oggetto rimosso)')}
                    </div>
                    <div className="lo-main__meta">
                      <span className={`chip ${TIPO_CHIP[tipo]}`}>{TIPO_LABEL[tipo]}</span>
                      {durata && <span><Icon name="clock" style={{ width: 12, height: 12, verticalAlign: -2 }} /> {durata}</span>}
                      {soglia != null && <span>soglia {soglia}%</span>}
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
                    <>
                      <span className="order-btns">
                        <button type="button" className="icon-btn" aria-label="Sposta su" title="Sposta su" disabled={busy || i === 0} onClick={() => sposta(s.id, -1)}><Icon name="chevronUp" /></button>
                        <button type="button" className="icon-btn" aria-label="Sposta giù" title="Sposta giù" disabled={busy || i === list.length - 1} onClick={() => sposta(s.id, 1)}><Icon name="chevronDown" /></button>
                      </span>
                      <button type="button" className="icon-btn" title="Togli dal corso" aria-label="Togli dal corso" disabled={busy} onClick={() => remove(s)}>
                        <Icon name="trash" />
                      </button>
                    </>
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
  tipo: LearningObjectType | null;
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
  const [aggiungendo, setAggiungendo] = useState(false);
  const [newType, setNewType] = useState<LearningObjectType>('video');
  const [titolo, setTitolo] = useState('');
  const [vimeo, setVimeo] = useState('');
  const [durata, setDurata] = useState('');
  const [soglia, setSoglia] = useState('70');
  const [pdf, setPdf] = useState<File | null>(null);
  const [errs, setErrs] = useState<Errori>({});
  const [q, setQ] = useState('');
  const pdfRef = useRef<HTMLInputElement>(null);

  const libFiltered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return availableLo.filter((lo) => !n || lo.titolo.toLowerCase().includes(n));
  }, [availableLo, q]);

  function valida(): Errori {
    const e: Errori = {};
    if (!titolo.trim()) e.titolo = 'Indica il titolo della lezione.';
    if (newType === 'video') {
      if (!vimeo.trim()) e.vimeo = 'Incolla l\'ID numerico o il link del video Vimeo.';
      const sec = parseMmSs(durata);
      if (!durata.trim()) e.durata = 'Indica la durata, es. 12:40.';
      else if (sec == null || sec <= 0) e.durata = 'Formato non valido: usa mm:ss (es. 12:40) o i secondi.';
    } else if (newType === 'quiz') {
      const s = Number(soglia);
      if (!soglia.trim() || !Number.isFinite(s) || s < 0 || s > 100) e.soglia = 'Percentuale da 0 a 100.';
    } else if (!pdf) {
      e.pdf = 'Seleziona il file PDF da caricare.';
    } else if (pdf.type !== 'application/pdf') {
      e.pdf = 'Il file deve essere un PDF.';
    }
    return e;
  }

  async function createAndAdd(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    const ve = valida();
    setErrs(ve);
    if (Object.keys(ve).length) return;
    try {
      let config: Record<string, unknown>;
      if (newType === 'video') {
        config = { vimeo_id: vimeo.trim(), durata_secondi: parseMmSs(durata) };
      } else if (newType === 'quiz') {
        config = { soglia_percentuale: Number(soglia), tentativi_max: null, ordine_casuale: true, mostra_correzione: true };
      } else {
        const file = pdf as File; // validato sopra
        onBusy(true);
        const supabase = createSupabaseBrowserClient();
        const loId = crypto.randomUUID();
        const key = `${corso.tenant_id}/${loId}.pdf`;
        const { error: upErr } = await supabase.storage.from('documenti').upload(key, file, { upsert: true, contentType: 'application/pdf' });
        onBusy(false);
        if (upErr) { setErrs({ pdf: `Caricamento non riuscito: ${upErr.message}` }); return; }
        config = { storage_key: key, mime: 'application/pdf', size: file.size, filename: file.name };
      }
      const created = (await call('POST', '/api/admin/learning-objects', { type: newType, titolo: titolo.trim(), config })) as { learning_object: { id: string } };
      await call('POST', `/api/admin/corsi/${corso.id}/struttura`, { learning_object_id: created.learning_object.id }, {
        successo: newType === 'quiz' ? 'Test creato e aggiunto al corso: ora aggiungi le domande (apri il test dalla struttura).' : 'Contenuto creato e aggiunto al corso.',
        busy: setAggiungendo,
      });
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
          <button type="button" className={newType === 'quiz' ? 'is-active' : ''} onClick={() => setNewType('quiz')}>Test</button>
        </div>
        <form onSubmit={createAndAdd} noValidate>
          <Field id="nuovo-titolo" label="Titolo" required error={errs.titolo}>
            <input id="nuovo-titolo" className="input" value={titolo} onChange={(e) => { setTitolo(e.target.value); if (errs.titolo) setErrs({ ...errs, titolo: '' }); }} disabled={busy} placeholder="es. Concetti di rischio" aria-invalid={Boolean(errs.titolo)} />
          </Field>
          {newType === 'video' ? (
            <div className="grid-2">
              <Field id="nuovo-vimeo" label="ID o link Vimeo" required error={errs.vimeo}>
                <input id="nuovo-vimeo" className="input" value={vimeo} onChange={(e) => { setVimeo(e.target.value); if (errs.vimeo) setErrs({ ...errs, vimeo: '' }); }} disabled={busy} placeholder="es. 824601551 oppure https://vimeo.com/824601551/abc123" aria-invalid={Boolean(errs.vimeo)} />
              </Field>
              <Field id="nuovo-durata" label="Durata" required error={errs.durata} hint="mm:ss, es. 12:40">
                <input id="nuovo-durata" className="input" value={durata} onChange={(e) => { setDurata(e.target.value); if (errs.durata) setErrs({ ...errs, durata: '' }); }} disabled={busy} placeholder="12:40" inputMode="numeric" aria-invalid={Boolean(errs.durata)} />
              </Field>
            </div>
          ) : newType === 'quiz' ? (
            <Field id="nuovo-soglia" label="Soglia di superamento (%)" required error={errs.soglia} hint="Le domande si aggiungono subito dopo, dalla pagina del test (tentativi illimitati, modificabili lì).">
              <input id="nuovo-soglia" className="input" type="number" min={0} max={100} value={soglia} onChange={(e) => { setSoglia(e.target.value); if (errs.soglia) setErrs({ ...errs, soglia: '' }); }} disabled={busy} aria-invalid={Boolean(errs.soglia)} />
            </Field>
          ) : (
            <Field id="nuovo-pdf" label="File PDF" required error={errs.pdf}>
              <div>
                <button id="nuovo-pdf" type="button" className="btn btn--secondary btn--sm" onClick={() => pdfRef.current?.click()} disabled={busy}>
                  <Icon name="upload" /> {pdf ? pdf.name : 'Seleziona PDF'}
                </button>
              </div>
              <input ref={pdfRef} type="file" accept="application/pdf" hidden onChange={(e) => { setPdf(e.target.files?.[0] ?? null); if (errs.pdf) setErrs({ ...errs, pdf: '' }); }} />
            </Field>
          )}
          <button type="submit" className="btn" disabled={busy}>{aggiungendo ? 'Aggiungo…' : 'Crea e aggiungi'}</button>
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
                <span className={`type-ico type-ico--${lo.type}`}><Icon name={TIPO_ICON[lo.type]} /></span>
                <div className="libitem__main">
                  <div className="libitem__title">{lo.titolo}</div>
                  <div className="libitem__meta">{TIPO_LABEL[lo.type]}</div>
                </div>
                <button type="button" className="btn btn--secondary btn--xs" disabled={busy} onClick={() => call('POST', `/api/admin/corsi/${corso.id}/struttura`, { learning_object_id: lo.id }, { successo: `"${lo.titolo}" aggiunto al corso.` })}>
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
  const { toast } = useFeedback();
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
        const tipo: LearningObjectType | null = tipoRaw.startsWith('vid') ? 'video' : tipoRaw.startsWith('doc') || tipoRaw.includes('pdf') ? 'documento' : tipoRaw.startsWith('test') || tipoRaw.startsWith('quiz') ? 'quiz' : null;
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
      toast(e instanceof Error ? e.message : String(e), 'errore');
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
    }, { successo: `${importabili.length} contenut${importabili.length === 1 ? 'o importato' : 'i importati'}.` });
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
        <div className="dropzone__s">colonne: Titolo, Tipo (video/documento/test), Riferimento (ID Vimeo; per i test la soglia %), Durata (mm:ss), Obbligatorio · da Excel: salva come CSV</div>
      </div>
      <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(parse); e.target.value = ''; }} />

      {rows.length > 0 && (
        <div className="import-preview">
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>#</th><th>Titolo</th><th>Tipo</th><th>Esito</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.riga}>
                  <td className="mono">{r.riga}</td>
                  <td>{r.titolo || <span className="muted">—</span>}</td>
                  <td>{r.tipo ? TIPO_LABEL[r.tipo] : '—'}</td>
                  <td>
                    {r.esito === 'errore' ? <span className="chip chip--err">Errore · {r.motivo}</span>
                      : r.esito === 'libreria' ? <span className="chip chip--teal">Dalla libreria</span>
                      : <span className="chip chip--ocra">Nuovo contenuto</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
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
type EdizioneForm = { codice: string; data_inizio: string; data_fine: string; fad_apertura: string; fad_chiusura: string };
const EDIZIONE_VUOTA: EdizioneForm = { codice: '', data_inizio: '', data_fine: '', fad_apertura: '', fad_chiusura: '' };

function validaEdizione(v: EdizioneForm, edizioni: EdizioneRow[], skipId?: string): Errori {
  const e: Errori = {};
  const codice = v.codice.trim();
  if (!codice) e.codice = 'Indica un codice, es. ED-2026-01.';
  else if (edizioni.some((x) => x.id !== skipId && x.codice.toLowerCase() === codice.toLowerCase())) e.codice = 'Esiste già un\'edizione con questo codice.';
  if (dataDopo(v.data_inizio, v.data_fine)) e.data_fine = 'La fine non può precedere l\'inizio.';
  if (dataDopo(v.fad_apertura, v.fad_chiusura)) e.fad_chiusura = 'La chiusura non può precedere l\'apertura.';
  return e;
}

function EdizioneCampi({ v, errs, onChange, busy, prefix }: { v: EdizioneForm; errs: Errori; onChange: (v: EdizioneForm) => void; busy: boolean; prefix: string }) {
  const set = (k: keyof EdizioneForm) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...v, [k]: e.target.value });
  return (
    <>
      <Field id={`${prefix}-codice`} label="Codice" required error={errs.codice}>
        <input id={`${prefix}-codice`} className="input mono" value={v.codice} onChange={set('codice')} disabled={busy} placeholder="es. ED-2026-01" aria-invalid={Boolean(errs.codice)} />
      </Field>
      <Field id={`${prefix}-di`} label="Inizio corso">
        <input id={`${prefix}-di`} className="input" type="date" value={v.data_inizio} onChange={set('data_inizio')} disabled={busy} />
      </Field>
      <Field id={`${prefix}-df`} label="Fine corso" error={errs.data_fine}>
        <input id={`${prefix}-df`} className="input" type="date" value={v.data_fine} onChange={set('data_fine')} disabled={busy} aria-invalid={Boolean(errs.data_fine)} />
      </Field>
      <Field id={`${prefix}-fa`} label="Apertura FAD" hint="Da quando le lezioni online sono fruibili.">
        <input id={`${prefix}-fa`} className="input" type="date" value={v.fad_apertura} onChange={set('fad_apertura')} disabled={busy} />
      </Field>
      <Field id={`${prefix}-fc`} label="Chiusura FAD" error={errs.fad_chiusura}>
        <input id={`${prefix}-fc`} className="input" type="date" value={v.fad_chiusura} onChange={set('fad_chiusura')} disabled={busy} aria-invalid={Boolean(errs.fad_chiusura)} />
      </Field>
    </>
  );
}

function SezioneEdizioni({
  corsoId,
  edizioni,
  busy,
  call,
}: {
  corsoId: string;
  edizioni: EdizioneRow[];
  busy: boolean;
  call: CallFn;
  onError: ErrFn;
  onBusy: BusyFn;
}) {
  const { confirm } = useFeedback();
  const [creando, setCreando] = useState(false);
  const [nuova, setNuova] = useState<EdizioneForm>(EDIZIONE_VUOTA);
  const [errs, setErrs] = useState<Errori>({});
  const [mostraForm, setMostraForm] = useState(edizioni.length === 0);
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EdizioneForm>(EDIZIONE_VUOTA);
  const [editErrs, setEditErrs] = useState<Errori>({});
  const [salvando, setSalvando] = useState(false);
  const [soloAttive, setSoloAttive] = useState(true);

  const nonAttive = edizioni.filter((e) => edizioneStato(e) !== 'attiva').length;
  const visibili = soloAttive && nonAttive > 0 ? edizioni.filter((e) => edizioneStato(e) === 'attiva') : edizioni;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const ve = validaEdizione(nuova, edizioni);
    setErrs(ve);
    if (Object.keys(ve).length) return;
    // La prima edizione congela il corso (D22): è irreversibile, va detto prima.
    if (edizioni.length === 0) {
      const ok = await confirm({
        titolo: 'Creare la prima edizione e congelare il corso?',
        messaggio: <>Da questo momento <strong>titolo, categoria, impostazioni e struttura</strong> non saranno più modificabili, perché le persone iscritte devono seguire sempre lo stesso percorso. Restano modificabili la descrizione, la copertina e i contenuti delle singole lezioni. Non si può tornare indietro.</>,
        conferma: 'Crea edizione e congela',
      });
      if (!ok) return;
    }
    // `call` gestisce busy, errore e `router.refresh()`: senza il refresh
    // l'edizione creata non compariva e un secondo clic ne creava un doppione.
    try {
      await call('POST', `/api/admin/corsi/${corsoId}/edizioni`, {
        codice: nuova.codice.trim(),
        data_inizio: nuova.data_inizio || null, data_fine: nuova.data_fine || null,
        fad_apertura: nuova.fad_apertura || null, fad_chiusura: nuova.fad_chiusura || null,
      }, { successo: `Edizione ${nuova.codice.trim()} creata.`, busy: setCreando });
      setNuova(EDIZIONE_VUOTA);
      setMostraForm(false);
    } catch {
      // errore già mostrato dal banner
    }
  }

  function apriModifica(e: EdizioneRow) {
    setEditId(e.id);
    setEditErrs({});
    setEdit({ codice: e.codice, data_inizio: e.data_inizio ?? '', data_fine: e.data_fine ?? '', fad_apertura: e.fad_apertura ?? '', fad_chiusura: e.fad_chiusura ?? '' });
  }

  async function salvaModifica(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    const ve = validaEdizione(edit, edizioni, editId);
    setEditErrs(ve);
    if (Object.keys(ve).length) return;
    try {
      await call('PATCH', `/api/admin/edizioni/${editId}`, {
        codice: edit.codice.trim(),
        data_inizio: edit.data_inizio || null, data_fine: edit.data_fine || null,
        fad_apertura: edit.fad_apertura || null, fad_chiusura: edit.fad_chiusura || null,
      }, { successo: `Edizione ${edit.codice.trim()} aggiornata.`, busy: setSalvando });
      setEditId(null);
    } catch {
      /* mostrato */
    }
  }

  return (
    <div className="card">
      <SectionHead
        n={4}
        title="Edizioni"
        sub="Ogni erogazione del corso è un'edizione con il suo codice, le date e la finestra in cui le lezioni online sono fruibili. La prima edizione congela il corso."
        right={
          <div className="row">
            {nonAttive > 0 && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSoloAttive((v) => !v)}>
                {soloAttive ? `Mostra anche ${nonAttive} concluse/annullate` : 'Solo attive'}
              </button>
            )}
            {!mostraForm && (
              <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={() => setMostraForm(true)}><Icon name="plus" /> Nuova edizione</button>
            )}
          </div>
        }
      />
      <div className="card__body">
        {edizioni.length === 0 ? (
          <div className="muted" style={{ marginBottom: 14, fontSize: 13 }}>Nessuna edizione ancora creata: il corso resta in bozza e modificabile.</div>
        ) : (
          <div className="tbl-wrap"><table className="tbl" style={{ marginBottom: 16 }}>
            <thead><tr><th>Codice</th><th>Stato</th><th>Date del corso</th><th>Finestra FAD</th><th></th></tr></thead>
            <tbody>
              {visibili.map((e) => {
                const stato = edizioneStato(e);
                if (editId === e.id) {
                  return (
                    <tr key={e.id} className="is-editing">
                      <td colSpan={5}>
                        <form className="edit-form" onSubmit={salvaModifica} noValidate>
                          <EdizioneCampi v={edit} errs={editErrs} onChange={setEdit} busy={busy} prefix={`ed-${e.id}`} />
                          <div className="edit-form__actions">
                            <button type="submit" className="btn btn--sm" disabled={busy}>{salvando ? 'Salvo…' : 'Salva modifiche'}</button>
                            <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setEditId(null)}>Annulla</button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={e.id}>
                    <td className="mono">{e.codice}</td>
                    <td>
                      <span className={`chip ${stato === 'attiva' ? 'chip--teal' : stato === 'conclusa' ? 'chip--muted' : 'chip--err'}`}>
                        {stato === 'attiva' && <span className="dot" />}{stato}
                      </span>
                    </td>
                    <td className="muted">{e.data_inizio || e.data_fine ? `${fmtData(e.data_inizio)} → ${fmtData(e.data_fine)}` : '—'}</td>
                    <td className="muted">{e.fad_apertura || e.fad_chiusura ? `${fmtData(e.fad_apertura)} → ${fmtData(e.fad_chiusura)}` : 'sempre aperta'}</td>
                    <td>
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn--ghost btn--xs" disabled={busy || stato === 'annullata'} onClick={() => apriModifica(e)}><Icon name="edit" /> Modifica</button>
                        <button type="button" className="btn btn--ghost btn--xs" disabled={busy || stato !== 'attiva'} onClick={async () => { if (await confirm({ titolo: `Concludere l'edizione ${e.codice}?`, messaggio: 'Gli iscritti non potranno più fruire dei contenuti. Lo stato finale di ciascuno resta registrato.', conferma: 'Concludi' })) call('POST', `/api/admin/edizioni/${e.id}/concludi`, undefined, { successo: `Edizione ${e.codice} conclusa.` }); }}>Concludi</button>
                        <button type="button" className="btn btn--danger btn--xs" disabled={busy || stato === 'annullata'} onClick={async () => { if (await confirm({ titolo: `Annullare l'edizione ${e.codice}?`, messaggio: 'L\'edizione resta nel registro come annullata e non sarà più fruibile. L\'operazione non si può annullare.', conferma: 'Annulla edizione', pericolosa: true })) call('POST', `/api/admin/edizioni/${e.id}/annulla`, undefined, { successo: `Edizione ${e.codice} annullata.` }); }}>Annulla edizione</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibili.length === 0 && (
                <tr><td colSpan={5} className="muted">Nessuna edizione attiva.</td></tr>
              )}
            </tbody>
          </table></div>
        )}

        {mostraForm && (
          <form onSubmit={create} noValidate style={{ borderTop: edizioni.length ? '1px dashed var(--line)' : 0, paddingTop: edizioni.length ? 14 : 0 }}>
            <h4 style={{ margin: '0 0 12px' }}>Nuova edizione</h4>
            <div className="grid-3">
              <EdizioneCampi v={nuova} errs={errs} onChange={(v) => { setNuova(v); if (Object.keys(errs).length) setErrs({}); }} busy={busy} prefix="nuova" />
            </div>
            <div className="row">
              <button type="submit" className="btn" disabled={busy}>{creando ? 'Creo…' : edizioni.length === 0 ? 'Crea edizione e congela il corso' : 'Crea edizione'}</button>
              {edizioni.length > 0 && <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => { setMostraForm(false); setErrs({}); }}>Annulla</button>}
            </div>
          </form>
        )}
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
  data_nascita: string;
  luogo_nascita: string;
  esito: 'nuovo' | 'duplicato' | 'errore';
  motivo?: string;
};

const ISCRITTI_PER_PAGINA = 25;

function SezioneIscritti({
  edizioni,
  iscrittiByEdizione,
  piani,
  politicaAttestato,
  busy,
  call,
  onBusy,
}: {
  edizioni: EdizioneRow[];
  iscrittiByEdizione: Record<string, IscrittoRow[]>;
  piani: PianoMini[];
  politicaAttestato: PoliticaAttestato;
  busy: boolean;
  call: CallFn;
  onBusy: BusyFn;
}) {
  const { confirm } = useFeedback();
  // Di default si lavora sulle edizioni attive; le concluse/annullate si mostrano a richiesta.
  const attiveSolo = edizioni.filter((e) => edizioneStato(e) === 'attiva');
  const [tutteLeEdizioni, setTutteLeEdizioni] = useState(attiveSolo.length === 0);
  const attive = tutteLeEdizioni ? edizioni : attiveSolo;
  const [selId, setSelId] = useState<string>(attive[0]?.id ?? '');
  const sel = attive.find((e) => e.id === selId) ?? attive[0];
  const iscritti = sel ? iscrittiByEdizione[sel.id] ?? [] : [];
  const selAttiva = sel ? edizioneStato(sel) === 'attiva' : false;

  const [mode, setMode] = useState<'manuale' | 'csv'>('manuale');
  const [q, setQ] = useState('');
  const [pagina, setPagina] = useState(1);

  const filtrati = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return iscritti;
    return iscritti.filter((i) => `${i.cognome} ${i.nome} ${i.email} ${i.codice_fiscale ?? ''} ${i.azienda ?? ''} ${i.piano_titolo ?? ''}`.toLowerCase().includes(n));
  }, [iscritti, q]);
  const pagine = Math.max(1, Math.ceil(filtrati.length / ISCRITTI_PER_PAGINA));
  const paginaCorrente = Math.min(pagina, pagine);
  const visibili = filtrati.slice((paginaCorrente - 1) * ISCRITTI_PER_PAGINA, paginaCorrente * ISCRITTI_PER_PAGINA);

  function scegliEdizione(id: string) {
    setSelId(id);
    setQ('');
    setPagina(1);
  }

  async function assegnaPiano(i: IscrittoRow, pianoId: string) {
    const piano = piani.find((p) => p.id === pianoId);
    await call('PATCH', `/api/admin/iscrizioni/${i.iscrizione_id}`, { piano_id: pianoId || null }, {
      successo: piano ? `${i.cognome} ${i.nome}: piano "${piano.titolo}" assegnato.` : `${i.cognome} ${i.nome}: nessun piano finanziato.`,
    });
  }

  // Emissione (o riemissione con motivazione) dell'attestato: il server
  // ricalcola l'idoneità; a percorso incompleto risponde con un errore chiaro.
  const [riemetti, setRiemetti] = useState<{ iscrizione_id: string; motivazione: string } | null>(null);
  async function emettiAttestato(i: IscrittoRow) {
    if (i.attestato) { setRiemetti({ iscrizione_id: i.iscrizione_id, motivazione: '' }); return; }
    if (!(await confirm({ titolo: `Emettere l'attestato a ${i.cognome} ${i.nome}?`, messaggio: 'Viene emesso solo se il percorso risulta completato adesso. Il documento è numerato e non si modifica: un errore si corregge con una riemissione.', conferma: 'Emetti' }))) return;
    await call('POST', `/api/admin/iscrizioni/${i.iscrizione_id}/attestato`, {}, { successo: `Attestato emesso a ${i.cognome} ${i.nome}.` });
  }
  async function confermaRiemissione() {
    if (!riemetti) return;
    const mot = riemetti.motivazione.trim();
    if (!mot) return;
    const i = iscritti.find((x) => x.iscrizione_id === riemetti.iscrizione_id);
    await call('POST', `/api/admin/iscrizioni/${riemetti.iscrizione_id}/attestato`, { motivazione: mot }, { successo: `Nuovo attestato emesso${i ? ` a ${i.cognome} ${i.nome}` : ''}; il precedente risulta sostituito.` });
    setRiemetti(null);
  }

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
        {(attive.length > 1 || attiveSolo.length !== edizioni.length) && (
          <div className="row row--wrap" style={{ marginBottom: 14 }}>
            <span className="filterset__label">Edizione</span>
            <div className="seg seg--mono">
              {attive.map((e) => (
                <button key={e.id} type="button" className={e.id === sel?.id ? 'is-active' : ''} onClick={() => scegliEdizione(e.id)}>
                  {e.codice}{edizioneStato(e) !== 'attiva' ? ` · ${edizioneStato(e)}` : ''}
                </button>
              ))}
            </div>
            {attiveSolo.length !== edizioni.length && attiveSolo.length > 0 && (
              <button type="button" className="btn btn--ghost btn--xs" onClick={() => setTutteLeEdizioni((v) => !v)}>
                {tutteLeEdizioni ? 'Solo attive' : `Anche ${edizioni.length - attiveSolo.length} concluse/annullate`}
              </button>
            )}
          </div>
        )}

        {iscritti.length === 0 ? (
          <div className="muted" style={{ marginBottom: 16, fontSize: 13 }}>Nessun iscritto su questa edizione.</div>
        ) : (
          <>
            {iscritti.length > 8 && (
              <div className="toolbar" style={{ marginBottom: 12 }}>
                <div className="search">
                  <Icon name="search" />
                  <input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="Cerca per nome, email, codice fiscale, azienda…" aria-label="Cerca tra gli iscritti" />
                </div>
              </div>
            )}
            <div className="tbl-wrap"><table className="tbl tbl--zebra">
              <thead><tr><th>Cognome e nome</th><th>Email</th><th>Codice fiscale</th><th>Azienda</th><th>Piano finanziato</th><th>Attestato</th><th></th></tr></thead>
              <tbody>
                {visibili.map((i) => (
                  <tr key={i.iscrizione_id}>
                    <td className="t-title">{i.cognome} {i.nome}</td>
                    <td className="muted">{i.email}</td>
                    <td className="mono">{i.codice_fiscale ?? <span className="chip chip--err">assente</span>}</td>
                    <td>{i.azienda ?? <span className="muted">—</span>}</td>
                    <td>
                      {piani.length === 0 ? (
                        <span className="muted" title="Crea un piano nella sezione Report fondi">—</span>
                      ) : (
                        <select className="select select--sm" value={i.piano_id ?? ''} disabled={busy} aria-label={`Piano finanziato di ${i.cognome} ${i.nome}`} onChange={(e) => assegnaPiano(i, e.target.value)}>
                          <option value="">— nessuno —</option>
                          {piani.map((p) => <option key={p.id} value={p.id}>{p.titolo}{p.fondo ? ` (${p.fondo})` : ''}</option>)}
                        </select>
                      )}
                    </td>
                    <td>
                      {politicaAttestato === 'nessuna' ? <span className="muted">—</span> : i.attestato ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                          <a className="mono" href={`/api/attestati/${i.attestato.id}/pdf`} target="_blank" rel="noreferrer" title="Apri il PDF">n. {i.attestato.numero}</a>
                          <span className="muted" style={{ fontSize: 11 }}>{fmtData(i.attestato.emesso_at)} · <button type="button" className="link-btn" disabled={busy} onClick={() => emettiAttestato(i)}>riemetti</button></span>
                        </div>
                      ) : (
                        <button type="button" className="btn btn--ghost btn--xs" disabled={busy} onClick={() => emettiAttestato(i)}>Emetti</button>
                      )}
                    </td>
                    <td>
                      <button type="button" className="icon-btn" title="Rimuovi iscritto" aria-label={`Rimuovi ${i.cognome} ${i.nome}`} disabled={busy} onClick={async () => { if (await confirm({ titolo: `Rimuovere ${i.cognome} ${i.nome} dall'edizione?`, messaggio: 'La persona resta in anagrafica; viene tolta solo l\'iscrizione a questa edizione.', conferma: 'Rimuovi', pericolosa: true })) call('DELETE', `/api/admin/iscrizioni/${i.iscrizione_id}`, undefined, { successo: `${i.cognome} ${i.nome} rimosso dall'edizione.` }); }}>
                        <Icon name="trash" />
                      </button>
                    </td>
                  </tr>
                ))}
                {visibili.length === 0 && (
                  <tr><td colSpan={7} className="muted">Nessun iscritto corrisponde a “{q}”.</td></tr>
                )}
              </tbody>
            </table></div>
            {riemetti && (
              <form className="edit-form" style={{ margin: '10px 0 14px' }} onSubmit={(e) => { e.preventDefault(); confermaRiemissione(); }}>
                <Field id="riem-mot" label="Motivazione della riemissione" required hint="Finisce nel registro insieme al numero del nuovo attestato; il precedente resta consultabile come sostituito.">
                  <input id="riem-mot" className="input" value={riemetti.motivazione} onChange={(e) => setRiemetti({ ...riemetti, motivazione: e.target.value })} disabled={busy} placeholder="es. cognome errato in anagrafica, ora corretto" autoFocus />
                </Field>
                <div className="row">
                  <button type="submit" className="btn btn--sm" disabled={busy || !riemetti.motivazione.trim()}>Emetti il nuovo attestato</button>
                  <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setRiemetti(null)}>Annulla</button>
                </div>
              </form>
            )}
            <Pager page={paginaCorrente} pages={pagine} total={filtrati.length} perPage={ISCRITTI_PER_PAGINA} onChange={setPagina} cosa="iscritti" />
            <div style={{ marginBottom: 16 }} />
          </>
        )}

        {sel && selAttiva ? (
          <>
            <div className="between row" style={{ borderTop: '1px dashed var(--line)', paddingTop: 14, marginBottom: 12 }}>
              <h4 style={{ margin: 0 }}>Aggiungi iscritti a {sel.codice}</h4>
              <div className="seg">
                <button type="button" className={mode === 'manuale' ? 'is-active' : ''} onClick={() => setMode('manuale')}>Manuale</button>
                <button type="button" className={mode === 'csv' ? 'is-active' : ''} onClick={() => setMode('csv')}>Da Excel/CSV</button>
              </div>
            </div>
            {mode === 'manuale' ? (
              <IscrittoManuale edizioneId={sel.id} piani={piani} busy={busy} call={call} />
            ) : (
              <IscrittiCsv edizioneId={sel.id} esistenti={iscritti} busy={busy} call={call} onBusy={onBusy} />
            )}
          </>
        ) : sel ? (
          <div className="muted" style={{ fontSize: 13, borderTop: '1px dashed var(--line)', paddingTop: 14 }}>
            L&apos;edizione {sel.codice} è {edizioneStato(sel)}: non si aggiungono iscritti.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function IscrittoManuale({
  edizioneId,
  piani,
  busy,
  call,
}: {
  edizioneId: string;
  piani: PianoMini[];
  busy: boolean;
  call: CallFn;
}) {
  const [cognome, setCognome] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [cf, setCf] = useState('');
  const [azienda, setAzienda] = useState('');
  const [pianoId, setPianoId] = useState('');
  const [dataNascita, setDataNascita] = useState('');
  const [luogoNascita, setLuogoNascita] = useState('');
  const [errs, setErrs] = useState<Errori>({});
  const [aggiungendo, setAggiungendo] = useState(false);

  function valida(): Errori {
    const e: Errori = {};
    if (!cognome.trim()) e.cognome = 'Il cognome è obbligatorio.';
    if (!nome.trim()) e.nome = 'Il nome è obbligatorio.';
    if (!email.trim()) e.email = 'L\'email è obbligatoria: serve per l\'accesso.';
    else if (!isEmail(email)) e.email = 'Controlla l\'indirizzo: non sembra un\'email valida.';
    if (cf.trim() && !isCodiceFiscale(cf)) e.cf = 'Il codice fiscale deve avere 16 caratteri nel formato previsto.';
    return e;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ve = valida();
    setErrs(ve);
    if (Object.keys(ve).length) return;
    try {
      await call('POST', `/api/admin/edizioni/${edizioneId}/iscritti`, {
        cognome: cognome.trim(), nome: nome.trim(), email: email.trim(),
        codice_fiscale: cf.trim().toUpperCase() || null, azienda: azienda.trim() || null,
        piano_id: pianoId || null,
        data_nascita: dataNascita || null, luogo_nascita: luogoNascita.trim() || null,
      }, { successo: `${cognome.trim()} ${nome.trim()} iscritto all'edizione.`, busy: setAggiungendo });
      setCognome(''); setNome(''); setEmail(''); setCf(''); setAzienda(''); setDataNascita(''); setLuogoNascita('');
    } catch { /* mostrato da call */ }
  }

  const clear = (k: string) => { if (errs[k]) setErrs({ ...errs, [k]: '' }); };

  return (
    <form onSubmit={submit} noValidate>
      <div className="grid-3">
        <Field id="isc-cognome" label="Cognome" required error={errs.cognome}>
          <input id="isc-cognome" className="input" value={cognome} onChange={(e) => { setCognome(e.target.value); clear('cognome'); }} disabled={busy} placeholder="es. Bianchi" autoComplete="off" aria-invalid={Boolean(errs.cognome)} />
        </Field>
        <Field id="isc-nome" label="Nome" required error={errs.nome}>
          <input id="isc-nome" className="input" value={nome} onChange={(e) => { setNome(e.target.value); clear('nome'); }} disabled={busy} placeholder="es. Marco" autoComplete="off" aria-invalid={Boolean(errs.nome)} />
        </Field>
        <Field id="isc-email" label="Email" required error={errs.email}>
          <input id="isc-email" className="input" type="email" value={email} onChange={(e) => { setEmail(e.target.value); clear('email'); }} disabled={busy} placeholder="nome@azienda.it" autoComplete="off" aria-invalid={Boolean(errs.email)} />
        </Field>
      </div>
      <div className="grid-3">
        <Field id="isc-cf" label="Codice fiscale" error={errs.cf} hint="Richiesto per la rendicontazione dei corsi finanziati.">
          <input id="isc-cf" className="input mono" value={cf} onChange={(e) => { setCf(e.target.value); clear('cf'); }} disabled={busy} placeholder="RSSMRC80A01H501X" autoComplete="off" aria-invalid={Boolean(errs.cf)} />
        </Field>
        <Field id="isc-azienda" label="Azienda">
          <input id="isc-azienda" className="input" value={azienda} onChange={(e) => setAzienda(e.target.value)} disabled={busy} placeholder="Ragione sociale" autoComplete="off" />
        </Field>
        <Field id="isc-piano" label="Piano finanziato" hint={piani.length === 0 ? 'Nessun piano: si crea nella sezione Report fondi.' : undefined}>
          <select id="isc-piano" className="select" value={pianoId} onChange={(e) => setPianoId(e.target.value)} disabled={busy || piani.length === 0}>
            <option value="">— nessuno —</option>
            {piani.map((p) => <option key={p.id} value={p.id}>{p.titolo}{p.fondo ? ` (${p.fondo})` : ''}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid-3">
        <Field id="isc-dn" label="Data di nascita" hint="Compare sull’attestato. Il discente può completarla dal profilo.">
          <input id="isc-dn" className="input" type="date" value={dataNascita} onChange={(e) => setDataNascita(e.target.value)} disabled={busy} />
        </Field>
        <Field id="isc-ln" label="Luogo di nascita">
          <input id="isc-ln" className="input" value={luogoNascita} onChange={(e) => setLuogoNascita(e.target.value)} disabled={busy} placeholder="es. Bergamo" autoComplete="off" />
        </Field>
      </div>
      <button type="submit" className="btn" disabled={busy}><Icon name="plus" /> {aggiungendo ? 'Aggiungo…' : 'Aggiungi iscritto'}</button>
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
  const { toast } = useFeedback();
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
        dn: matchCol(headers, ['data di nascita', 'data nascita', 'nato il', 'birth date', 'data_nascita']),
        ln: matchCol(headers, ['luogo di nascita', 'luogo nascita', 'nato a', 'birth place', 'luogo_nascita']),
      };
      const seenEmail = new Set<string>();
      const seenCf = new Set<string>();
      const out: ImportIscrittoRow[] = raw.map((r, idx) => {
        const cognome = (ci.cognome >= 0 ? r[ci.cognome] : '')?.trim() ?? '';
        const nome = (ci.nome >= 0 ? r[ci.nome] : '')?.trim() ?? '';
        const email = (ci.email >= 0 ? r[ci.email] : '')?.trim() ?? '';
        const cf = (ci.cf >= 0 ? r[ci.cf] : '')?.trim() ?? '';
        const azienda = (ci.azienda >= 0 ? r[ci.azienda] : '')?.trim() ?? '';
        const data_nascita = (ci.dn >= 0 ? r[ci.dn] : '')?.trim() ?? '';
        const luogo_nascita = (ci.ln >= 0 ? r[ci.ln] : '')?.trim() ?? '';
        let esito: ImportIscrittoRow['esito'] = 'nuovo';
        let motivo: string | undefined;
        const ek = email.toLowerCase(); const ck = cf.toLowerCase();
        if (!cognome || !nome || !email) { esito = 'errore'; motivo = 'cognome/nome/email mancanti'; }
        else if (emails.has(ek) || (ck && cfs.has(ck)) || seenEmail.has(ek) || (ck && seenCf.has(ck))) { esito = 'duplicato'; motivo = 'già iscritto'; }
        if (esito === 'nuovo') { seenEmail.add(ek); if (ck) seenCf.add(ck); }
        return { riga: idx + 1, cognome, nome, email, codice_fiscale: cf, azienda, data_nascita, luogo_nascita, esito, motivo };
      });
      setRows(out);
    } catch (e) {
      setRows([]);
      toast(e instanceof Error ? e.message : String(e), 'errore');
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
          data_nascita: r.data_nascita || null, luogo_nascita: r.luogo_nascita || null,
        })),
      }, { successo: `${importabili.length} iscritt${importabili.length === 1 ? 'o importato' : 'i importati'}.` });
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
        <div className="dropzone__s">colonne: Cognome, Nome, Email, Codice fiscale, Azienda, Data di nascita (gg/mm/aaaa), Luogo di nascita · da Excel: salva come CSV</div>
      </div>
      <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(parse); e.target.value = ''; }} />

      {rows.length > 0 && (
        <div className="import-preview">
          <div className="tbl-wrap"><table className="tbl">
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
          </table></div>
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
