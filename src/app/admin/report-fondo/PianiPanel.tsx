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

// Piani formativi finanziati del tenant: elenco + creazione. L'assegnazione
// agli iscritti si fa nel Course Builder (sezione Iscritti).
export function PianiPanel({ piani }: { piani: PianoRow[] }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [aperto, setAperto] = useState(piani.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errs, setErrs] = useState<Errori>({});
  const [f, setF] = useState({ titolo: '', codice: '', fondo: 'fondimpresa', cup: '', avviso: '', canale: '' });

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
      const res = await fetch('/api/admin/piani', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...f, titolo: f.titolo.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast(`Piano "${f.titolo.trim()}" creato.`);
      setF({ titolo: '', codice: '', fondo: 'fondimpresa', cup: '', avviso: '', canale: '' });
      setAperto(false);
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
          <div className="sub">Il piano (fondo, avviso, CUP) si assegna agli iscritti nel corso, sezione Iscritti.</div>
        </div>
        {!aperto && (
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => setAperto(true)}><Icon name="plus" /> Nuovo piano</button>
        )}
      </div>
      <div className="card__body">
        {piani.length === 0 ? (
          <div className="muted" style={{ marginBottom: 14, fontSize: 13 }}>Nessun piano finanziato ancora registrato.</div>
        ) : (
          <div className="tbl-wrap"><table className="tbl tbl--zebra" style={{ marginBottom: aperto ? 16 : 0 }}>
            <thead><tr><th>Piano</th><th>Fondo</th><th>Avviso</th><th>CUP</th><th>Canale</th><th className="col-r">Iscritti</th></tr></thead>
            <tbody>
              {piani.map((p) => (
                <tr key={p.id}>
                  <td><span className="t-title">{p.titolo}</span>{p.codice && <span className="mono muted"> · {p.codice}</span>}</td>
                  <td>{p.fondo ?? <span className="muted">—</span>}</td>
                  <td className="muted">{p.avviso ?? '—'}</td>
                  <td>{p.cup ? <span className="mono">{p.cup}</span> : <span className="chip chip--err">assente</span>}</td>
                  <td className="muted">{p.canale ?? '—'}</td>
                  <td className="col-r">{p.n_iscritti}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}

        {aperto && (
          <form onSubmit={submit} noValidate style={{ borderTop: piani.length ? '1px dashed var(--line)' : 0, paddingTop: piani.length ? 14 : 0 }}>
            <h4 style={{ margin: '0 0 12px' }}>Nuovo piano</h4>
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
              <button type="submit" className="btn" disabled={busy}>{busy ? 'Creo…' : 'Crea piano'}</button>
              {piani.length > 0 && <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => { setAperto(false); setErrs({}); }}>Annulla</button>}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
