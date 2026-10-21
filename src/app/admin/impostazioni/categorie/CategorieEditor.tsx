'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import type { CategoriaRow } from '@/lib/db-types';
import { Icon } from '@/components/admin/Atlante';
import { Field } from '@/components/admin/Form';
import { useFeedback } from '@/components/ui/Feedback';
import { useCall } from '@/components/admin/useCall';
import { ErrorBanner } from '@/components/admin/ErrorBanner';

type Riga = CategoriaRow & { n_corsi: number };

/** Elenco delle categorie: aggiungi, rinomina inline, sposta su/giù, elimina se non usata. */
export function CategorieEditor({ categorie, orfane }: { categorie: Riga[]; orfane: string[] }) {
  const { confirm, toast } = useFeedback();
  const { call, busy, error } = useCall();
  const [nuova, setNuova] = useState('');
  const [errNuova, setErrNuova] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string; nome: string } | null>(null);

  async function aggiungi(e: React.FormEvent) {
    e.preventDefault();
    const nome = nuova.trim();
    if (!nome) { setErrNuova('Scrivi il nome della categoria.'); return; }
    if (categorie.some((c) => c.nome.toLowerCase() === nome.toLowerCase())) { setErrNuova('Esiste già.'); return; }
    setErrNuova(null);
    try { await call('POST', '/api/admin/categorie', { nome }, { successo: `Categoria "${nome}" aggiunta.` }); setNuova(''); } catch { /* banner */ }
  }

  async function rinomina() {
    if (!edit) return;
    const nome = edit.nome.trim();
    const c = categorie.find((x) => x.id === edit.id);
    if (!c || !nome || nome === c.nome) { setEdit(null); return; }
    try {
      const r = (await call('PATCH', `/api/admin/categorie/${edit.id}`, { nome })) as { corsi_aggiornati?: number };
      toast(`Rinominata in "${nome}"${r.corsi_aggiornati ? `: ${r.corsi_aggiornati} ${r.corsi_aggiornati === 1 ? 'corso in bozza aggiornato' : 'corsi in bozza aggiornati'}` : ''}.`);
      setEdit(null);
    } catch { /* banner */ }
  }

  async function sposta(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= categorie.length) return;
    // Un solo salvataggio con l'ordine completo: o cambia tutto o niente.
    const ids = categorie.map((c) => c.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      await call('PUT', '/api/admin/categorie/ordine', { ids });
    } catch { /* banner */ }
  }

  async function elimina(c: Riga) {
    if (!(await confirm({ titolo: `Eliminare la categoria "${c.nome}"?`, messaggio: 'Non è usata da alcun corso: sparisce dai selettori. Si può ricreare.', conferma: 'Elimina', pericolosa: true }))) return;
    try { await call('DELETE', `/api/admin/categorie/${c.id}`, undefined, { successo: `Categoria "${c.nome}" eliminata.` }); } catch { /* banner */ }
  }

  return (
    <div className="grid-2-380">
      <div className="card">
        <div className="card__head"><div><h3>Categorie</h3><div className="sub">L&apos;ordine qui è l&apos;ordine nei selettori.</div></div></div>
        <div className="card__body card__body--flush">
          <ErrorBanner error={error} />
          {categorie.length === 0 ? (
            <div className="card__body"><div className="muted">Nessuna categoria: aggiungine una a destra.</div></div>
          ) : (
            <div className="tbl-wrap"><table className="tbl tbl--zebra">
              <thead><tr><th style={{ width: 40 }}>#</th><th>Nome</th><th>Corsi</th><th></th></tr></thead>
              <tbody>
                {categorie.map((c, i) => (
                  <tr key={c.id}>
                    <td className="muted mono">{i + 1}</td>
                    <td className="t-title">
                      {edit?.id === c.id ? (
                        <form className="row" onSubmit={(e) => { e.preventDefault(); rinomina(); }}>
                          <input className="input" value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} disabled={busy} autoFocus maxLength={60} aria-label="Nuovo nome" style={{ maxWidth: 280 }} />
                          <button type="submit" className="btn btn--sm" disabled={busy}>Salva</button>
                          <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setEdit(null)}>Annulla</button>
                        </form>
                      ) : c.nome}
                    </td>
                    <td>{c.n_corsi > 0 ? <Link className="t-link" href={`/admin/corsi?categoria=${encodeURIComponent(c.nome)}` as Route}>{c.n_corsi}</Link> : <span className="muted">—</span>}</td>
                    <td>
                      <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                        <button type="button" className="icon-btn" title="Sposta su" aria-label={`Sposta su ${c.nome}`} disabled={busy || i === 0} onClick={() => sposta(i, -1)}><Icon name="chevronUp" /></button>
                        <button type="button" className="icon-btn" title="Sposta giù" aria-label={`Sposta giù ${c.nome}`} disabled={busy || i === categorie.length - 1} onClick={() => sposta(i, 1)}><Icon name="chevronDown" /></button>
                        <button type="button" className="icon-btn" title="Rinomina" aria-label={`Rinomina ${c.nome}`} disabled={busy} onClick={() => setEdit({ id: c.id, nome: c.nome })}><Icon name="edit" /></button>
                        <button type="button" className="icon-btn" title={c.n_corsi > 0 ? 'Usata da corsi: non si elimina' : 'Elimina'} aria-label={`Elimina ${c.nome}`} disabled={busy || c.n_corsi > 0} onClick={() => elimina(c)}><Icon name="trash" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      </div>
      <div>
        <form className="card" onSubmit={aggiungi} noValidate>
          <div className="card__head"><h3>Nuova categoria</h3></div>
          <div className="card__body">
            <Field id="cat-nome" label="Nome" required error={errNuova} hint="Es. Sicurezza, Privacy, Soft skill. Massimo 60 caratteri.">
              <input id="cat-nome" className="input" value={nuova} onChange={(e) => { setNuova(e.target.value); if (errNuova) setErrNuova(null); }} disabled={busy} maxLength={60} aria-invalid={Boolean(errNuova)} />
            </Field>
            <button type="submit" className="btn" disabled={busy}><Icon name="plus" /> Aggiungi</button>
          </div>
        </form>
        {orfane.length > 0 && (
          <div className="card">
            <div className="card__head"><h3>Usate dai corsi ma non in elenco</h3></div>
            <div className="card__body">
              <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Nomi scritti a mano in passato: aggiungili qui sopra con lo stesso nome per averli nei selettori.</p>
              <div className="head-chips" style={{ marginTop: 0 }}>{orfane.map((o) => <span key={o} className="chip chip--ocra">{o}</span>)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
