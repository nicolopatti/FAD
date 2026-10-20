'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { CorsoRow, LearningObjectRow, LearningObjectType, StrutturaCorsoConLO } from '@/lib/db-types';
import { parseDelimited } from '@/lib/csv';
import { useFeedback } from '@/components/ui/Feedback';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Icon, fmtDurataSec, regolaLabel } from '@/components/admin/Atlante';
import { Field } from '@/components/admin/Form';
import { useCall, type CallFn } from '@/components/admin/useCall';
import { ErrorBanner } from '@/components/admin/ErrorBanner';
import { parseMmSs, type Errori } from '@/lib/validazione';
import { TIPO_CHIP, TIPO_ICON, TIPO_LABEL, matchCol } from './shared';

/**
 * Scheda "Lezioni" del corso: la sequenza (riordino, obbligatorio, togli) e,
 * a corso in bozza, il pannello "Aggiungi lezione" (nuovo video, PDF o test,
 * dalla libreria, da CSV).
 */
export function Lezioni({
  corso,
  struttura,
  availableLo,
  frozen,
}: {
  corso: CorsoRow;
  struttura: StrutturaCorsoConLO[];
  availableLo: LearningObjectRow[];
  frozen: boolean;
}) {
  const { call, busy, error, setError, setBusy } = useCall();
  const [aggiungi, setAggiungi] = useState<'chiuso' | 'nuovo' | 'libreria' | 'csv'>(struttura.length === 0 && !frozen ? 'nuovo' : 'chiuso');

  return (
    <>
      <ErrorBanner error={error} />
      <Sequenza struttura={struttura} frozen={frozen} busy={busy} call={call} corsoId={corso.id} />

      {frozen ? (
        <div className="banner banner--freeze">
          <Icon name="lock" className="banner__icon" />
          <div className="banner__body">
            Il corso ha edizioni: la sequenza delle lezioni non si modifica, così chi è iscritto segue sempre lo stesso percorso.
            Per cambiarla, <strong>duplica il corso</strong> e lavora sulla copia. I contenuti delle singole lezioni (video, file, domande) restano modificabili dalla libreria.
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card__head">
            <div>
              <h3>Aggiungi lezione</h3>
              <div className="sub">Un nuovo video, PDF o test, oppure un contenuto già in libreria. Le lezioni si accodano alla sequenza.</div>
            </div>
            <div className="seg" role="group" aria-label="Come aggiungere">
              <button type="button" className={aggiungi === 'nuovo' ? 'is-active' : ''} onClick={() => setAggiungi('nuovo')}>Nuova</button>
              <button type="button" className={aggiungi === 'libreria' ? 'is-active' : ''} onClick={() => setAggiungi('libreria')}>Dalla libreria</button>
              <button type="button" className={aggiungi === 'csv' ? 'is-active' : ''} onClick={() => setAggiungi('csv')}>Da Excel/CSV</button>
            </div>
          </div>
          {aggiungi !== 'chiuso' && (
            <div className="card__body">
              {aggiungi === 'nuovo' && <NuovaLezione corso={corso} busy={busy} call={call} onError={setError} onBusy={setBusy} />}
              {aggiungi === 'libreria' && <DallaLibreria corsoId={corso.id} availableLo={availableLo} busy={busy} call={call} />}
              {aggiungi === 'csv' && <DaCsv corsoId={corso.id} availableLo={availableLo} struttura={struttura} busy={busy} call={call} />}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ── Sequenza (drag & drop, tastiera, obbligatorio, togli) ───────────────
function Sequenza({
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

  // Riallinea l'ordine locale quando cambia la membership (aggiunta/rimozione dal server).
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

  const durataTot = list.reduce((acc, s) => acc + (s.learning_object?.type === 'video' && typeof s.learning_object.config?.durata_secondi === 'number' ? (s.learning_object.config.durata_secondi as number) : 0), 0);

  return (
    <div className="card">
      <div className="card__head">
        <div>
          <h3>Sequenza delle lezioni</h3>
          <div className="sub">
            {frozen
              ? 'In sola lettura: il corso ha edizioni.'
              : 'Riordina trascinando le righe, con i pulsanti su e giù o con le frecce da tastiera sulla maniglia. Le lezioni obbligatorie servono per il completamento.'}
          </div>
        </div>
        {list.length > 0 && (
          <span className="chip chip--muted">
            {list.length} {list.length === 1 ? 'lezione' : 'lezioni'}{durataTot > 0 ? ` · ${fmtDurataSec(durataTot)} di video` : ''}
          </span>
        )}
      </div>
      <div className="card__body">
        {list.length === 0 ? (
          <div className="empty">
            <Icon name="layers" className="empty__icon" />
            <div className="empty__t">Nessuna lezione</div>
            <div className="empty__s">{frozen ? 'Il corso non ha lezioni online.' : 'Aggiungi la prima lezione dal pannello qui sotto.'}</div>
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
                      <Link href={`/admin/learning-objects/${s.learning_object_id}`} title={tipo === 'quiz' ? 'Apri le domande del test' : 'Apri il contenuto nella libreria'}>{lo?.titolo ?? '(contenuto rimosso)'}</Link>
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
                  <label className="switch" title={s.obbligatorio ? 'Obbligatoria' : 'Facoltativa'}>
                    <input type="checkbox" checked={s.obbligatorio} disabled={busy || frozen} onChange={() => toggleObbligatorio(s)} />
                    <span className="switch__track" />
                    <span className="switch__label">{s.obbligatorio ? 'Obbligatoria' : 'Facoltativa'}</span>
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

// ── Nuova lezione (video / PDF / test) ──────────────────────────────────
function NuovaLezione({
  corso,
  busy,
  call,
  onError,
  onBusy,
}: {
  corso: CorsoRow;
  busy: boolean;
  call: CallFn;
  onError: (m: string | null) => void;
  onBusy: (v: boolean) => void;
}) {
  const [aggiungendo, setAggiungendo] = useState(false);
  const [newType, setNewType] = useState<LearningObjectType>('video');
  const [titolo, setTitolo] = useState('');
  const [vimeo, setVimeo] = useState('');
  const [durata, setDurata] = useState('');
  const [soglia, setSoglia] = useState('70');
  const [pdf, setPdf] = useState<File | null>(null);
  const [errs, setErrs] = useState<Errori>({});
  const pdfRef = useRef<HTMLInputElement>(null);

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
        const file = pdf as File;
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
        successo: newType === 'quiz' ? 'Test aggiunto al corso: ora scrivi le domande (apri il test dalla sequenza).' : 'Lezione aggiunta al corso.',
        busy: setAggiungendo,
      });
      setTitolo(''); setVimeo(''); setDurata(''); setPdf(null);
    } catch {
      /* errore già mostrato */
    }
  }

  return (
    <form onSubmit={createAndAdd} noValidate style={{ maxWidth: 720 }}>
      <div className="seg seg--mono" style={{ marginBottom: 12 }}>
        <button type="button" className={newType === 'video' ? 'is-active' : ''} onClick={() => setNewType('video')}>Video</button>
        <button type="button" className={newType === 'documento' ? 'is-active' : ''} onClick={() => setNewType('documento')}>Documento PDF</button>
        <button type="button" className={newType === 'quiz' ? 'is-active' : ''} onClick={() => setNewType('quiz')}>Test</button>
      </div>
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
        <Field id="nuovo-soglia" label="Soglia di superamento (%)" required error={errs.soglia} hint="Le domande si scrivono subito dopo, dalla pagina del test.">
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
  );
}

// ── Dalla libreria ───────────────────────────────────────────────────────
function DallaLibreria({ corsoId, availableLo, busy, call }: { corsoId: string; availableLo: LearningObjectRow[]; busy: boolean; call: CallFn }) {
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState<'tutti' | LearningObjectType>('tutti');
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return availableLo.filter((lo) => (tipo === 'tutti' || lo.type === tipo) && (!n || lo.titolo.toLowerCase().includes(n)));
  }, [availableLo, q, tipo]);

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="search">
          <Icon name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca nella libreria…" aria-label="Cerca nella libreria" />
        </div>
        <div className="toolbar__spacer" />
        <div className="seg seg--mono" role="group" aria-label="Tipo">
          {(['tutti', 'video', 'documento', 'quiz'] as const).map((t) => (
            <button key={t} type="button" className={tipo === t ? 'is-active' : ''} onClick={() => setTipo(t)}>{t === 'tutti' ? 'Tutti' : TIPO_LABEL[t]}</button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>
          {availableLo.length === 0 ? 'Nessun contenuto disponibile: tutti quelli in libreria sono già nel corso.' : 'Nessun contenuto corrisponde alla ricerca.'}
        </div>
      ) : (
        <div style={{ maxHeight: 360, overflow: 'auto' }}>
          {filtered.map((lo) => (
            <div key={lo.id} className="libitem">
              <span className={`type-ico type-ico--${lo.type}`}><Icon name={TIPO_ICON[lo.type]} /></span>
              <div className="libitem__main">
                <div className="libitem__title">{lo.titolo}</div>
                <div className="libitem__meta">{TIPO_LABEL[lo.type]}{lo.type === 'video' && typeof lo.config?.durata_secondi === 'number' ? ` · ${fmtDurataSec(lo.config.durata_secondi as number)}` : ''}</div>
              </div>
              <button type="button" className="btn btn--secondary btn--xs" disabled={busy} onClick={() => call('POST', `/api/admin/corsi/${corsoId}/struttura`, { learning_object_id: lo.id }, { successo: `"${lo.titolo}" aggiunto al corso.` })}>
                <Icon name="plus" /> Aggiungi
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Da CSV ───────────────────────────────────────────────────────────────
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

function DaCsv({
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
    }, { successo: `${importabili.length} lezion${importabili.length === 1 ? 'e importata' : 'i importate'}.` });
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
        <>
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
          <div className="row" style={{ marginTop: 14 }}>
            <button type="button" className="btn" disabled={busy || importabili.length === 0} onClick={importa}>
              Importa {importabili.length} {importabili.length === 1 ? 'lezione' : 'lezioni'}
            </button>
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setRows([])}>Annulla</button>
          </div>
        </>
      )}
    </>
  );
}
