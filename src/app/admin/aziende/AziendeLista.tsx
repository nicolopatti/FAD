'use client';

import { useEffect, useState } from 'react';
import type { AziendaRiepilogo } from '@/lib/db-types';
import { Icon } from '@/components/admin/Atlante';
import { Field } from '@/components/admin/Form';
import { useFeedback } from '@/components/ui/Feedback';
import { useCall } from '@/components/admin/useCall';
import { ErrorBanner } from '@/components/admin/ErrorBanner';
import { PagerUrl, RicercaUrl } from '@/components/admin/Lista';

type Campi = { ragione_sociale: string; partita_iva: string; codice_fiscale: string; codice_ateco: string; sede_indirizzo: string; sede_cap: string; sede_comune: string; sede_provincia: string };
const VUOTA: Campi = { ragione_sociale: '', partita_iva: '', codice_fiscale: '', codice_ateco: '', sede_indirizzo: '', sede_cap: '', sede_comune: '', sede_provincia: '' };
const daRiga = (a: AziendaRiepilogo): Campi => ({ ragione_sociale: a.ragione_sociale, partita_iva: a.partita_iva ?? '', codice_fiscale: a.codice_fiscale ?? '', codice_ateco: a.codice_ateco ?? '', sede_indirizzo: a.sede_indirizzo ?? '', sede_cap: a.sede_cap ?? '', sede_comune: a.sede_comune ?? '', sede_provincia: a.sede_provincia ?? '' });

type Candidata = { id: string; ragione_sociale: string; partita_iva: string | null; sede_comune: string | null; n_iscrizioni: number };

/** Lista delle aziende: nuova, modifica inline, unione di un doppione in un'altra azienda. */
export function AziendeLista({ righe, totale, pagina, perPagina, q, senzaPiva, apriNuova }: {
  righe: AziendaRiepilogo[]; totale: number; pagina: number; perPagina: number; q: string; senzaPiva: number; apriNuova: boolean;
}) {
  const { confirm } = useFeedback();
  const { call, busy, error } = useCall();
  const [nuova, setNuova] = useState(apriNuova);
  const [edit, setEdit] = useState<string | null>(null);
  const [unisci, setUnisci] = useState<AziendaRiepilogo | null>(null);

  return (
    <>
      <ErrorBanner error={error} />
      <div className="toolbar">
        <RicercaUrl placeholder="Cerca per ragione sociale, partita IVA o comune" label="Cerca un'azienda" />
        <div className="toolbar__spacer" />
        {senzaPiva > 0 && <span className="muted" style={{ fontSize: 13 }}>{senzaPiva} senza partita IVA</span>}
        {!nuova && <button type="button" className="btn btn--sm" onClick={() => setNuova(true)}><Icon name="plus" /> Nuova azienda</button>}
      </div>

      {nuova && (
        <AziendaForm titolo="Nuova azienda" iniziale={VUOTA} busy={busy} onAnnulla={() => setNuova(false)}
          onSalva={async (c) => { await call('POST', '/api/admin/aziende', c, { successo: `Azienda "${c.ragione_sociale}" creata.` }); setNuova(false); }} />
      )}

      {righe.length === 0 ? (
        <div className="empty">
          <Icon name="building" className="empty__icon" />
          <div className="empty__t">{q ? `Nessuna azienda per “${q}”` : 'Nessuna azienda'}</div>
          <div className="empty__s">Le aziende nascono dalle iscrizioni (campo Azienda o Partita IVA) oppure da &quot;Nuova azienda&quot;.</div>
        </div>
      ) : (
        <div className="card">
          <div className="card__body card__body--flush">
            <div className="tbl-wrap"><table className="tbl tbl--zebra">
              <thead><tr><th>Ragione sociale</th><th>Partita IVA</th><th>Sede</th><th>Iscrizioni</th><th>Persone</th><th></th></tr></thead>
              <tbody>
                {righe.map((a) => (
                  <tr key={a.id}>
                    {edit === a.id ? (
                      <td colSpan={6} style={{ padding: 0 }}>
                        <AziendaForm titolo={`Modifica ${a.ragione_sociale}`} iniziale={daRiga(a)} busy={busy} inRiga onAnnulla={() => setEdit(null)}
                          onSalva={async (c) => { await call('PATCH', `/api/admin/aziende/${a.id}`, c, { successo: 'Azienda salvata.' }); setEdit(null); }} />
                      </td>
                    ) : (
                      <>
                        <td className="t-title">{a.ragione_sociale}</td>
                        <td className="mono">{a.partita_iva ?? <span className="chip chip--ocra">assente</span>}</td>
                        <td className="muted">{[a.sede_comune, a.sede_provincia].filter(Boolean).join(' ') || '—'}</td>
                        <td>{a.n_iscrizioni}</td>
                        <td className="muted">{a.n_persone}</td>
                        <td>
                          <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                            <button type="button" className="icon-btn" title="Modifica" aria-label={`Modifica ${a.ragione_sociale}`} disabled={busy} onClick={() => { setEdit(a.id); setUnisci(null); }}><Icon name="edit" /></button>
                            <button type="button" className="btn btn--ghost btn--xs" disabled={busy} title="È un doppione: sposta le sue iscrizioni su un'altra azienda" onClick={() => { setUnisci(a); setEdit(null); }}>Unisci in…</button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </div>
      )}
      <PagerUrl pagina={pagina} totale={totale} perPagina={perPagina} cosa="aziende" />

      {unisci && (
        <UnisciPanel da={unisci} busy={busy} onAnnulla={() => setUnisci(null)} onConferma={async (dest) => {
          const ok = await confirm({
            titolo: `Unire "${unisci.ragione_sociale}" in "${dest.ragione_sociale}"?`,
            messaggio: <>Le {unisci.n_iscrizioni} iscrizioni di <strong>{unisci.ragione_sociale}</strong> passano a <strong>{dest.ragione_sociale}</strong>, i campi vuoti si completano e la riga doppia sparisce. L&apos;operazione resta nel registro e non si annulla.</>,
            conferma: 'Unisci', pericolosa: true,
          });
          if (!ok) return;
          try { await call('POST', `/api/admin/aziende/${unisci.id}/unisci`, { in: dest.id }, { successo: `Aziende unite: ${unisci.n_iscrizioni} iscrizioni spostate su ${dest.ragione_sociale}.` }); setUnisci(null); } catch { /* banner */ }
        }} />
      )}
    </>
  );
}

function AziendaForm({ titolo, iniziale, busy, inRiga, onSalva, onAnnulla }: { titolo: string; iniziale: Campi; busy: boolean; inRiga?: boolean; onSalva: (c: Campi) => Promise<void>; onAnnulla: () => void }) {
  const [f, setF] = useState<Campi>(iniziale);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof Campi) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.ragione_sociale.trim()) { setErr('La ragione sociale è obbligatoria.'); return; }
    const piva = f.partita_iva.replace(/\s/g, '').replace(/^IT/i, '');
    if (piva && !/^\d{11}$/.test(piva)) { setErr('La partita IVA deve avere 11 cifre.'); return; }
    setErr(null);
    try { await onSalva({ ...f, partita_iva: piva }); } catch { /* banner del chiamante */ }
  }
  return (
    <form className={inRiga ? 'edit-form' : 'card'} onSubmit={submit} noValidate style={inRiga ? { margin: 12 } : undefined}>
      {!inRiga && <div className="card__head"><h3>{titolo}</h3></div>}
      <div className={inRiga ? '' : 'card__body'}>
        <div className="grid-3">
          <Field id="az-rs" label="Ragione sociale" required error={err && !f.ragione_sociale.trim() ? err : null}><input id="az-rs" className="input" value={f.ragione_sociale} onChange={set('ragione_sociale')} disabled={busy} autoFocus /></Field>
          <Field id="az-piva" label="Partita IVA" error={err && f.ragione_sociale.trim() ? err : null} hint="11 cifre: è la chiave con cui si riconosce l'azienda nei CSV."><input id="az-piva" className="input mono" value={f.partita_iva} onChange={set('partita_iva')} disabled={busy} inputMode="numeric" /></Field>
          <Field id="az-cf" label="Codice fiscale"><input id="az-cf" className="input mono" value={f.codice_fiscale} onChange={set('codice_fiscale')} disabled={busy} /></Field>
        </div>
        <div className="grid-3">
          <Field id="az-ateco" label="Codice ATECO"><input id="az-ateco" className="input mono" value={f.codice_ateco} onChange={set('codice_ateco')} disabled={busy} /></Field>
          <Field id="az-ind" label="Indirizzo sede"><input id="az-ind" className="input" value={f.sede_indirizzo} onChange={set('sede_indirizzo')} disabled={busy} /></Field>
          <Field id="az-cap" label="CAP"><input id="az-cap" className="input mono" value={f.sede_cap} onChange={set('sede_cap')} disabled={busy} /></Field>
        </div>
        <div className="grid-3">
          <Field id="az-com" label="Comune"><input id="az-com" className="input" value={f.sede_comune} onChange={set('sede_comune')} disabled={busy} /></Field>
          <Field id="az-prov" label="Provincia" hint="Sigla, es. BG"><input id="az-prov" className="input mono" value={f.sede_provincia} onChange={set('sede_provincia')} disabled={busy} maxLength={2} /></Field>
        </div>
        <div className="row">
          <button type="submit" className="btn btn--sm" disabled={busy}><Icon name="check" /> Salva</button>
          <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={onAnnulla}>Annulla</button>
        </div>
      </div>
    </form>
  );
}

/** Scelta dell'azienda di destinazione, con ricerca sul server. */
function UnisciPanel({ da, busy, onAnnulla, onConferma }: { da: AziendaRiepilogo; busy: boolean; onAnnulla: () => void; onConferma: (dest: Candidata) => void }) {
  const [q, setQ] = useState('');
  const [candidate, setCandidate] = useState<Candidata[]>([]);
  const [scelta, setScelta] = useState<Candidata | null>(null);
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/aziende/cerca?q=${encodeURIComponent(q)}&escludi=${da.id}`);
        const json = await res.json();
        setCandidate(json.aziende ?? []);
      } catch { setCandidate([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, da.id]);
  return (
    <div className="card">
      <div className="card__head">
        <div><h3>Unisci &quot;{da.ragione_sociale}&quot; in un&apos;altra azienda</h3><div className="sub">Scegli la riga da tenere: quella scelta riceve le {da.n_iscrizioni} iscrizioni e i dati mancanti.</div></div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onAnnulla}>Chiudi</button>
      </div>
      <div className="card__body">
        <div className="grid-2">
          <div>
            <div className="search" style={{ marginBottom: 8 }}>
              <Icon name="search" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ragione sociale o partita IVA" aria-label="Cerca l'azienda da tenere" disabled={busy} />
            </div>
            <select className="select" size={6} value={scelta?.id ?? ''} onChange={(e) => setScelta(candidate.find((c) => c.id === e.target.value) ?? null)} disabled={busy} aria-label="Aziende" style={{ height: 'auto' }}>
              {candidate.map((c) => <option key={c.id} value={c.id}>{c.ragione_sociale}{c.partita_iva ? ` · ${c.partita_iva}` : ''}{c.sede_comune ? ` · ${c.sede_comune}` : ''} · {c.n_iscrizioni} iscr.</option>)}
            </select>
          </div>
          <div>
            {scelta ? (
              <>
                <p style={{ marginTop: 0 }}>Resta <strong>{scelta.ragione_sociale}</strong>{scelta.partita_iva && <> (P.IVA <span className="mono">{scelta.partita_iva}</span>)</>}; <strong>{da.ragione_sociale}</strong> sparisce.</p>
                <button type="button" className="btn btn--danger" disabled={busy} onClick={() => onConferma(scelta)}>Unisci le due aziende</button>
              </>
            ) : <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Seleziona dall&apos;elenco l&apos;azienda da tenere.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
