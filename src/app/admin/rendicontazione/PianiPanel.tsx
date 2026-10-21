'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/admin/Atlante';
import { Field } from '@/components/admin/Form';
import { useFeedback } from '@/components/ui/Feedback';
import type { Errori } from '@/lib/validazione';

export type PianoRow = {
  id: string;
  titolo: string;
  codice: string | null;
  fondo: string | null;
  cup: string | null;
  avviso: string | null;
  canale: string | null;
  n_iscritti: number;
};

const FONDI: [string, string][] = [['fondimpresa', 'Fondimpresa'], ['foncoop', 'FonCoop']];

// Piani formativi finanziati del tenant: elenco, creazione e modifica della
// testata. L'assegnazione agli iscritti si fa dalla scheda Fondo dell'edizione.
const VUOTO = { titolo: '', codice: '', fondo: 'fondimpresa', cup: '', avviso: '', canale: '' };
export function PianiPanel({ piani }: { piani: PianoRow[] }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [aperto, setAperto] = useState(piani.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errs, setErrs] = useState<Errori>({});
  const [f, setF] = useState(VUOTO);
  const [modifica, setModifica] = useState<string | null>(null);   // id del piano in modifica

  function apriNuovo() { setModifica(null); setF(VUOTO); setErrs({}); setError(null); setAperto(true); }
  function apriModifica(p: PianoRow) {
    setModifica(p.id);
    setF({ titolo: p.titolo, codice: p.codice ?? '', fondo: p.fondo ?? 'fondimpresa', cup: p.cup ?? '', avviso: p.avviso ?? '', canale: p.canale ?? '' });
    setErrs({}); setError(null); setAperto(true);
  }
  async function elimina(p: PianoRow) {
    if (!(await confirm({ titolo: `Eliminare il piano "${p.titolo}"?`, messaggio: 'Non è assegnato a nessun iscritto: sparisce dall’elenco e dai selettori. L’eliminazione resta nel registro.', conferma: 'Elimina', pericolosa: true }))) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/admin/piani/${p.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast(`Piano "${p.titolo}" eliminato.`);
      if (modifica === p.id) chiudi();
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg); toast(msg, 'errore');
    } finally { setBusy(false); }
  }

  function chiudi() { setAperto(false); setModifica(null); setErrs({}); setError(null); }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setF({ ...f, [k]: e.target.value });
    if (errs[k]) setErrs({ ...errs, [k]: '' });
  };

  function valida(): Errori {
    const e: Errori = {};
    if (!f.titolo.trim()) e.titolo = 'Indica il titolo del piano.';
    if (f.cup.trim() && !/^[A-Z0-9]{15}$/i.test(f.cup.trim())) e.cup = 'Il CUP è un codice di 15 caratteri alfanumerici.';
    return e;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const ve = valida();
    setErrs(ve);
    if (Object.keys(ve).length) return;
    setBusy(true);
    try {
      const res = await fetch(modifica ? `/api/admin/piani/${modifica}` : '/api/admin/piani', {
        method: modifica ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...f, titolo: f.titolo.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast(modifica ? `Piano "${f.titolo.trim()}" aggiornato.` : `Piano "${f.titolo.trim()}" creato.`);
      setF(VUOTO);
      setAperto(false);
      setModifica(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card__head">
        <div>
          <h3>Piani finanziati</h3>
          <div className="sub">Il piano (fondo, avviso, CUP) si assegna agli iscritti dalla scheda Fondo dell&apos;edizione. Modificarlo non cambia i report già depositati.</div>
        </div>
        {!aperto && (
          <button type="button" className="btn btn--secondary btn--sm" onClick={apriNuovo}><Icon name="plus" /> Nuovo piano</button>
        )}
      </div>
      <div className="card__body">
        {piani.length === 0 ? (
          <div className="muted" style={{ marginBottom: 14, fontSize: 13 }}>Nessun piano finanziato ancora registrato.</div>
        ) : (
          <div className="tbl-wrap"><table className="tbl tbl--zebra" style={{ marginBottom: aperto ? 16 : 0 }}>
            <thead><tr><th>Piano</th><th>Fondo</th><th>Avviso</th><th>CUP</th><th>Canale</th><th className="col-r">Iscritti</th><th className="col-r"><span className="sr-only">Azioni</span></th></tr></thead>
            <tbody>
              {piani.map((p) => (
                <tr key={p.id}>
                  <td><span className="t-title">{p.titolo}</span>{p.codice && <span className="mono muted"> · {p.codice}</span>}</td>
                  <td>{p.fondo ?? <span className="muted">—</span>}</td>
                  <td className="muted">{p.avviso ?? '—'}</td>
                  <td>{p.cup ? <span className="mono">{p.cup}</span> : <span className="chip chip--err">assente</span>}</td>
                  <td className="muted">{p.canale ?? '—'}</td>
                  <td className="col-r">{p.n_iscritti}</td>
                  <td className="col-r">
                    <span className="row" style={{ gap: 4, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => apriModifica(p)} aria-label={`Modifica il piano ${p.titolo}`}><Icon name="edit" /> Modifica</button>
                      {p.n_iscritti === 0 && <button type="button" className="icon-btn" disabled={busy} onClick={() => elimina(p)} aria-label={`Elimina il piano ${p.titolo}`} title="Elimina (non è assegnato a nessuno)"><Icon name="trash" /></button>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}

        {aperto && (
          <form onSubmit={submit} noValidate style={{ borderTop: piani.length ? '1px dashed var(--line)' : 0, paddingTop: piani.length ? 14 : 0 }}>
            <h4 style={{ margin: '0 0 12px' }}>{modifica ? 'Modifica piano' : 'Nuovo piano'}</h4>
            {error && <div className="banner banner--err"><Icon name="alert" className="banner__icon" /><div className="banner__body">{error}</div></div>}
            <div className="grid-3">
              <Field id="pf-titolo" label="Titolo" required error={errs.titolo}>
                <input id="pf-titolo" className="input" value={f.titolo} onChange={set('titolo')} disabled={busy} placeholder="es. Piano formativo 2026" aria-invalid={Boolean(errs.titolo)} />
              </Field>
              <Field id="pf-codice" label="Codice piano">
                <input id="pf-codice" className="input mono" value={f.codice} onChange={set('codice')} disabled={busy} placeholder="es. PF-2026-001" />
              </Field>
              <Field id="pf-fondo" label="Fondo">
                <select id="pf-fondo" className="select" value={f.fondo} onChange={set('fondo')} disabled={busy}>
                  {FONDI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Field id="pf-cup" label="CUP" error={errs.cup} hint="Obbligatorio per il deposito del report.">
                <input id="pf-cup" className="input mono" value={f.cup} onChange={set('cup')} disabled={busy} placeholder="B12C34000560006" aria-invalid={Boolean(errs.cup)} />
              </Field>
              <Field id="pf-avviso" label="Avviso">
                <input id="pf-avviso" className="input" value={f.avviso} onChange={set('avviso')} disabled={busy} placeholder="es. Avviso 1/2026" />
              </Field>
              <Field id="pf-canale" label="Canale">
                <input id="pf-canale" className="input" value={f.canale} onChange={set('canale')} disabled={busy} placeholder="es. Conto formazione" />
              </Field>
            </div>
            <div className="row">
              <button type="submit" className="btn" disabled={busy}>{busy ? 'Salvo…' : modifica ? 'Salva modifiche' : 'Crea piano'}</button>
              {piani.length > 0 && <button type="button" className="btn btn--ghost" disabled={busy} onClick={chiudi}>Annulla</button>}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
