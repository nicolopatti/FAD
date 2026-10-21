'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { QuizConfig, QuizDomandaRow, QuizTipoDomanda } from '@/lib/db-types';
import { parseQuizCsv, validaConfigQuiz, validaDomande, type DomandaInput } from '@/lib/quiz';
import { Icon } from '@/components/admin/Atlante';
import { Field } from '@/components/admin/Form';
import { useFeedback } from '@/components/ui/Feedback';
import type { Errori } from '@/lib/validazione';

type Domanda = DomandaInput & { key: string };
const LETTERE = 'ABCDEFGH';
let seq = 0;
const nuovaKey = () => `k${Date.now()}-${seq++}`;

function daRiga(d: QuizDomandaRow | DomandaInput): Domanda {
  return { key: nuovaKey(), testo: d.testo, tipo: d.tipo, risposte: d.risposte.map((r) => ({ testo: r.testo, corretta: r.corretta === true })) };
}
function vuota(): Domanda {
  return { key: nuovaKey(), testo: '', tipo: 'scelta_singola', risposte: [{ testo: '', corretta: true }, { testo: '', corretta: false }] };
}

// Editor del test: regole (soglia, tentativi, ordine, correzione) e domande.
// A test congelato (usato in un corso con edizioni) tutto è in sola lettura.
export function QuizEditor({ loId, config, domandeIniziali, congelato }: { loId: string; config: QuizConfig; domandeIniziali: QuizDomandaRow[]; congelato: boolean }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [domande, setDomande] = useState<Domanda[]>(domandeIniziali.length ? domandeIniziali.map(daRiga) : [vuota()]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errori, setErrori] = useState<string[]>([]);
  const [cfg, setCfg] = useState({ soglia: String(config.soglia_percentuale), tentativi: config.tentativi_max == null ? '' : String(config.tentativi_max), ordine: config.ordine_casuale, correzione: config.mostra_correzione });
  const [cfgErr, setCfgErr] = useState<Errori>({});
  const [cfgBusy, setCfgBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function aggiorna(f: (prev: Domanda[]) => Domanda[]) { setDomande(f); setDirty(true); setErrori([]); }
  const setD = (key: string, patch: Partial<Domanda>) => aggiorna((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const sposta = (i: number, dir: -1 | 1) => aggiorna((prev) => { const n = [...prev]; const j = i + dir; if (j < 0 || j >= n.length) return prev; [n[i], n[j]] = [n[j], n[i]]; return n; });

  function setRisposta(key: string, i: number, patch: { testo?: string; corretta?: boolean }) {
    aggiorna((prev) => prev.map((d) => {
      if (d.key !== key) return d;
      const risposte = d.risposte.map((r, k) => {
        if (k !== i) return d.tipo === 'scelta_singola' && patch.corretta ? { ...r, corretta: false } : r;
        return { ...r, ...patch };
      });
      return { ...d, risposte };
    }));
  }
  function cambiaTipo(key: string, tipo: QuizTipoDomanda) {
    aggiorna((prev) => prev.map((d) => {
      if (d.key !== key) return d;
      if (tipo === 'scelta_singola') {
        let trovata = false;
        return { ...d, tipo, risposte: d.risposte.map((r) => { const c = Boolean(r.corretta) && !trovata; if (c) trovata = true; return { ...r, corretta: c }; }) };
      }
      return { ...d, tipo };
    }));
  }

  async function salvaDomande() {
    const pulite: DomandaInput[] = domande.map((d) => ({ testo: d.testo.trim(), tipo: d.tipo, risposte: d.risposte.filter((r) => r.testo.trim()).map((r) => ({ testo: r.testo.trim(), corretta: Boolean(r.corretta) })) }));
    const errs = validaDomande(pulite);
    setErrori(errs);
    if (errs.length) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/learning-objects/${loId}/domande`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ domande: pulite }) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setDirty(false);
      toast(`${pulite.length} domand${pulite.length === 1 ? 'a salvata' : 'e salvate'}.`);
      router.refresh();
    } catch (err) {
      setErrori([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  }

  async function salvaRegole(e: React.FormEvent) {
    e.preventDefault();
    const v = validaConfigQuiz({ soglia_percentuale: Number(cfg.soglia), tentativi_max: cfg.tentativi, ordine_casuale: cfg.ordine, mostra_correzione: cfg.correzione });
    if (typeof v === 'string') { setCfgErr(v.includes('tentativi') ? { tentativi: 'Numero intero da 1 a 99, oppure vuoto.' } : { soglia: 'Percentuale da 0 a 100.' }); return; }
    setCfgErr({});
    setCfgBusy(true);
    try {
      const res = await fetch(`/api/admin/learning-objects/${loId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ config: v }) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast('Regole del test salvate.');
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'errore');
    } finally {
      setCfgBusy(false);
    }
  }

  async function importaCsv(text: string) {
    const { domande: lette, errori: errs } = parseQuizCsv(text);
    if (!lette.length) { setErrori(errs.length ? errs : ['Nessuna domanda trovata nel file.']); return; }
    const sostituisci = domande.some((d) => d.testo.trim())
      ? await confirm({ titolo: 'Sostituire le domande attuali?', messaggio: <>Il file contiene <strong>{lette.length} domande</strong>. Puoi aggiungerle a quelle presenti o sostituirle. Nulla viene salvato finché non premi “Salva domande”.</>, conferma: 'Sostituisci', annulla: 'Aggiungi in coda' })
      : true;
    aggiorna((prev) => (sostituisci ? lette.map(daRiga) : [...prev, ...lette.map(daRiga)]));
    setErrori(errs.filter((e) => !e.startsWith('Serve almeno')));
    toast(`${lette.length} domande lette dal file: controlla e salva.`, 'info');
  }

  return (
    <>
      <form className="card" onSubmit={salvaRegole} noValidate>
        <div className="card__head">
          <div><h3>Regole del test</h3><div className="sub">Soglia di superamento e tentativi. {congelato ? 'In sola lettura: il test è una lezione di un corso attivo.' : 'Si fissano con la prima edizione del corso che usa il test.'}</div></div>
        </div>
        <div className="card__body">
          <div className="grid-2">
            <Field id="q-soglia" label="Soglia di superamento (%)" required error={cfgErr.soglia}>
              <input id="q-soglia" className="input" type="number" min={0} max={100} value={cfg.soglia} onChange={(e) => setCfg({ ...cfg, soglia: e.target.value })} disabled={congelato || cfgBusy} aria-invalid={Boolean(cfgErr.soglia)} />
            </Field>
            <Field id="q-tentativi" label="Tentativi massimi" error={cfgErr.tentativi} hint="Vuoto = illimitati. Ogni tentativo resta nel registro.">
              <input id="q-tentativi" className="input" type="number" min={1} max={99} value={cfg.tentativi} onChange={(e) => setCfg({ ...cfg, tentativi: e.target.value })} disabled={congelato || cfgBusy} placeholder="illimitati" aria-invalid={Boolean(cfgErr.tentativi)} />
            </Field>
          </div>
          <div className="row row--wrap" style={{ gap: 20, marginBottom: 14 }}>
            <label className="switch"><input type="checkbox" checked={cfg.ordine} onChange={(e) => setCfg({ ...cfg, ordine: e.target.checked })} disabled={congelato || cfgBusy} /><span className="switch__track" /><span className="switch__label">Domande in ordine casuale</span></label>
            <label className="switch"><input type="checkbox" checked={cfg.correzione} onChange={(e) => setCfg({ ...cfg, correzione: e.target.checked })} disabled={congelato || cfgBusy} /><span className="switch__track" /><span className="switch__label">Mostra le risposte giuste dopo il superamento</span></label>
          </div>
          {!congelato && <button type="submit" className="btn btn--secondary btn--sm" disabled={cfgBusy}>{cfgBusy ? 'Salvo…' : 'Salva regole'}</button>}
        </div>
      </form>

      <div className="card">
        <div className="card__head">
          <div><h3>Domande</h3><div className="sub">{domande.length} domand{domande.length === 1 ? 'a' : 'e'} · scelta singola o multipla (tutto o niente). {congelato ? 'In sola lettura.' : ''}</div></div>
          {!congelato && (
            <div className="row">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => fileRef.current?.click()} disabled={busy}><Icon name="upload" /> Importa CSV</button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(importaCsv); e.target.value = ''; }} />
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => aggiorna((p) => [...p, vuota()])} disabled={busy}><Icon name="plus" /> Domanda</button>
            </div>
          )}
        </div>
        <div className="card__body">
          {errori.length > 0 && (
            <div className="banner banner--err"><Icon name="alert" className="banner__icon" /><div className="banner__body"><ul style={{ margin: 0, paddingLeft: 18 }}>{errori.map((e, i) => <li key={i}>{e}</li>)}</ul></div></div>
          )}
          {!congelato && <div className="field__hint" style={{ marginBottom: 14 }}>CSV con colonne: Domanda; Risposta A; Risposta B; Risposta C; Risposta D; Corretta (es. B oppure A,C). Da Excel: salva come CSV.</div>}

          <ol className="quiz-ed">
            {domande.map((d, i) => (
              <li key={d.key} className="quiz-ed__q">
                <div className="quiz-ed__head">
                  <span className="quiz-ed__n">{i + 1}</span>
                  <textarea className="textarea quiz-ed__testo" rows={2} value={d.testo} onChange={(e) => setD(d.key, { testo: e.target.value })} placeholder="Testo della domanda" disabled={congelato || busy} aria-label={`Domanda ${i + 1}`} />
                  {!congelato && (
                    <div className="quiz-ed__tools">
                      <div className="seg seg--mono">
                        <button type="button" className={d.tipo === 'scelta_singola' ? 'is-active' : ''} onClick={() => cambiaTipo(d.key, 'scelta_singola')}>Singola</button>
                        <button type="button" className={d.tipo === 'scelta_multipla' ? 'is-active' : ''} onClick={() => cambiaTipo(d.key, 'scelta_multipla')}>Multipla</button>
                      </div>
                      <span className="order-btns">
                        <button type="button" className="icon-btn" aria-label="Sposta su" disabled={i === 0} onClick={() => sposta(i, -1)}><Icon name="chevronUp" /></button>
                        <button type="button" className="icon-btn" aria-label="Sposta giù" disabled={i === domande.length - 1} onClick={() => sposta(i, 1)}><Icon name="chevronDown" /></button>
                      </span>
                      <button type="button" className="icon-btn" aria-label="Elimina domanda" title="Elimina domanda" disabled={domande.length === 1} onClick={() => aggiorna((p) => p.filter((x) => x.key !== d.key))}><Icon name="trash" /></button>
                    </div>
                  )}
                  {congelato && <span className="chip chip--muted">{d.tipo === 'scelta_singola' ? 'singola' : 'multipla'}</span>}
                </div>
                <ul className="quiz-ed__risposte">
                  {d.risposte.map((r, k) => (
                    <li key={k} className={`quiz-ed__r${r.corretta ? ' is-ok' : ''}`}>
                      <label className="quiz-ed__corretta" title={r.corretta ? 'Risposta corretta' : 'Segna come corretta'}>
                        <input type={d.tipo === 'scelta_singola' ? 'radio' : 'checkbox'} name={`corr-${d.key}`} checked={Boolean(r.corretta)} onChange={(e) => setRisposta(d.key, k, { corretta: d.tipo === 'scelta_singola' ? true : e.target.checked })} disabled={congelato || busy} />
                        <span className="quiz-ed__lettera">{LETTERE[k]}</span>
                      </label>
                      <input className="input" value={r.testo} onChange={(e) => setRisposta(d.key, k, { testo: e.target.value })} placeholder={`Risposta ${LETTERE[k]}`} disabled={congelato || busy} aria-label={`Risposta ${LETTERE[k]} della domanda ${i + 1}`} />
                      {!congelato && d.risposte.length > 2 && (
                        <button type="button" className="icon-btn" aria-label="Togli risposta" onClick={() => aggiorna((p) => p.map((x) => (x.key === d.key ? { ...x, risposte: x.risposte.filter((_, idx) => idx !== k) } : x)))}><Icon name="x" /></button>
                      )}
                    </li>
                  ))}
                </ul>
                {!congelato && d.risposte.length < 8 && (
                  <button type="button" className="btn btn--ghost btn--xs" onClick={() => aggiorna((p) => p.map((x) => (x.key === d.key ? { ...x, risposte: [...x.risposte, { testo: '', corretta: false }] } : x)))} disabled={busy}><Icon name="plus" /> Risposta</button>
                )}
              </li>
            ))}
          </ol>

          {!congelato && (
            <div className="row" style={{ marginTop: 16 }}>
              <button type="button" className="btn" onClick={salvaDomande} disabled={busy || !dirty}>{busy ? 'Salvo…' : 'Salva domande'}</button>
              {dirty && <span className="muted" style={{ fontSize: 13 }}>Modifiche non salvate</span>}
            </div>
          )}
          {congelato && <div className="field__hint">Per cambiare il test di un corso attivo: <Link href="/admin/learning-objects/new">crea un nuovo test</Link> e usalo in un nuovo corso (o in una copia del corso).</div>}
        </div>
      </div>
    </>
  );
}
