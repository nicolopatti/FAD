'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { STATO_CORSO_CHIP, STATO_CORSO_LABEL, type CorsoRiepilogo, type StatoCorso } from '@/lib/db-types';
import { Icon, Cover, coverUrl, fmtData, fmtMinuti } from '@/components/admin/Atlante';
import { useFeedback } from '@/components/ui/Feedback';
import { useCall } from '@/components/admin/useCall';
import { ErrorBanner } from '@/components/admin/ErrorBanner';
import { BulkBar, PagerUrl, RicercaUrl, SegUrl, SelectUrl } from '@/components/admin/Lista';

export type StatoF = 'tutti' | StatoCorso;
export type OrdineF = 'recenti' | 'titolo' | 'iscritti';

type EsitoBlocco = { fatti?: string[]; saltati?: { id: string; titolo: string; motivo: string }[] };

/** Catalogo a lista: ricerca, stato, categoria e ordine nell'URL; selezione per archiviare in blocco. */
export function CatalogoLista({ righe, totale, pagina, perPagina, stato, conteggi, categorie, q }: {
  righe: CorsoRiepilogo[]; totale: number; pagina: number; perPagina: number; stato: StatoF;
  conteggi: Record<StatoCorso, number>; categorie: string[]; q: string;
}) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const { call, busy, error } = useCall();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const nTutti = conteggi.attivo + conteggi.bozza + conteggi.concluso;
  const selezionati = righe.filter((r) => sel.has(r.id));
  const tuttiSel = righe.length > 0 && righe.every((r) => sel.has(r.id));

  function toggle(id: string) { setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function toggleTutti() { setSel(tuttiSel ? new Set() : new Set(righe.map((r) => r.id))); }

  async function archivia(ripristina: boolean) {
    const ids = selezionati.filter((r) => (ripristina ? r.archiviato_at : !r.archiviato_at && r.n_edizioni_attive === 0)).map((r) => r.id);
    const esclusi = selezionati.length - ids.length;
    if (!ids.length) { toast(ripristina ? 'Nessun corso archiviato tra i selezionati.' : 'I corsi selezionati hanno edizioni attive: concludi prima le edizioni.', 'errore'); return; }
    const ok = await confirm({
      titolo: ripristina ? `Ripristinare ${ids.length} ${ids.length === 1 ? 'corso' : 'corsi'}?` : `Archiviare ${ids.length} ${ids.length === 1 ? 'corso' : 'corsi'}?`,
      messaggio: ripristina
        ? <>Tornano nel catalogo e nei selettori.{esclusi > 0 && <> {esclusi} {esclusi === 1 ? 'corso selezionato non è archiviato e resta com’è' : 'corsi selezionati non sono archiviati e restano come sono'}.</>}</>
        : <>Spariscono dal catalogo, dalla dashboard e dai selettori; edizioni concluse, attestati e registro restano. Si ripristinano in qualsiasi momento dal filtro &quot;Archiviati&quot;.{esclusi > 0 && <> <strong>{esclusi}</strong> {esclusi === 1 ? 'corso selezionato ha edizioni attive e non viene archiviato' : 'corsi selezionati hanno edizioni attive e non vengono archiviati'}.</>}</>,
      conferma: ripristina ? 'Ripristina' : 'Archivia',
    });
    if (!ok) return;
    try {
      const r = (await call('POST', '/api/admin/corsi/archivia', { corso_ids: ids, ripristina })) as EsitoBlocco;
      const n = r.fatti?.length ?? 0;
      if (r.saltati?.length) toast(`${n} ${ripristina ? 'ripristinati' : 'archiviati'}, ${r.saltati.length} saltati: ${r.saltati[0].titolo || r.saltati[0].id} (${r.saltati[0].motivo})`, 'errore');
      else toast(`${n} ${n === 1 ? 'corso' : 'corsi'} ${ripristina ? (n === 1 ? 'ripristinato' : 'ripristinati') : (n === 1 ? 'archiviato' : 'archiviati')}.`);
      setSel(new Set());
    } catch { /* banner */ }
  }

  return (
    <>
      <ErrorBanner error={error} />
      <div className="toolbar">
        <RicercaUrl placeholder="Cerca per titolo o descrizione" label="Cerca un corso" />
        <div className="toolbar__spacer" />
        <div className="filterset">
          <SegUrl param="stato" predefinito="tutti" label="Stato" opzioni={[
            { v: 'tutti', label: `Tutti (${nTutti})` },
            { v: 'attivo', label: `Attivi (${conteggi.attivo})` },
            { v: 'bozza', label: `Bozze (${conteggi.bozza})` },
            { v: 'concluso', label: `Conclusi (${conteggi.concluso})` },
            { v: 'archiviato', label: `Archiviati (${conteggi.archiviato})` },
          ]} />
          {categorie.length > 0 && <SelectUrl param="categoria" label="Categoria" vuoto="Tutte le categorie" opzioni={categorie.map((c) => ({ v: c, label: c }))} />}
          <SelectUrl param="ordine" label="Ordina" predefinito="recenti" opzioni={[{ v: 'recenti', label: 'Più recenti' }, { v: 'titolo', label: 'Titolo A–Z' }, { v: 'iscritti', label: 'Più iscritti' }]} />
        </div>
      </div>

      <BulkBar n={selezionati.length} cosa={selezionati.length === 1 ? 'corso selezionato' : 'corsi selezionati'} onAzzera={() => setSel(new Set())}>
        {stato === 'archiviato'
          ? <button type="button" className="btn btn--sm" disabled={busy} onClick={() => archivia(true)}><Icon name="archive" /> Ripristina</button>
          : <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={() => archivia(false)} title="Solo i corsi senza edizioni attive"><Icon name="archive" /> Archivia</button>}
      </BulkBar>

      {righe.length === 0 ? (
        <div className="empty">
          <Icon name="search" className="empty__icon" />
          <div className="empty__t">{q ? `Nessun corso per “${q}”` : stato === 'archiviato' ? 'Nessun corso archiviato' : 'Nessun corso corrisponde ai filtri'}</div>
          <div className="empty__s">Prova a modificare la ricerca o ad azzerare i filtri.</div>
        </div>
      ) : (
        <div className="card">
          <div className="card__body card__body--flush">
            <div className="tbl-wrap"><table className="tbl tbl--zebra tbl--lista">
              <thead>
                <tr>
                  <th className="t-check"><input type="checkbox" checked={tuttiSel} onChange={toggleTutti} aria-label="Seleziona tutti i corsi della pagina" /></th>
                  <th>Corso</th><th>Stato</th><th>Lezioni</th><th>Edizioni</th><th>Iscritti</th><th>Creato</th><th></th>
                </tr>
              </thead>
              <tbody>
                {righe.map((c) => {
                  const href = `/admin/corsi/${c.id}` as const;
                  return (
                    <tr key={c.id} className={`is-link${sel.has(c.id) ? ' is-selected' : ''}`} onClick={() => router.push(href)}>
                      <td className="t-check" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Seleziona ${c.titolo}`} />
                      </td>
                      <td>
                        <div className="lista-corso">
                          <Cover categoria={c.categoria} src={coverUrl(c.cover_path)} className="cover--thumb" />
                          <div style={{ minWidth: 0 }}>
                            <Link className="t-link" href={href} onClick={(e) => e.stopPropagation()}>{c.titolo}</Link>
                            <div className="muted lista-corso__meta">
                              {c.categoria ?? 'senza categoria'}
                              {c.durata_sec > 0 && <> · {fmtMinuti(c.durata_sec)} di video</>}
                              {c.visione_integrale && <> · visione integrale</>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td><span className={`chip ${STATO_CORSO_CHIP[c.stato]}`}>{c.stato === 'attivo' && <span className="dot" />}{STATO_CORSO_LABEL[c.stato]}</span></td>
                      <td>{c.n_lezioni === 0 ? <span className="chip chip--ocra">nessuna</span> : c.n_lezioni}</td>
                      <td className="muted">{c.n_edizioni_attive > 0 ? <><strong style={{ color: 'var(--ink)' }}>{c.n_edizioni_attive}</strong> {c.n_edizioni_attive === 1 ? 'attiva' : 'attive'} su {c.n_edizioni}</> : c.n_edizioni}</td>
                      <td>{c.n_iscritti}</td>
                      <td className="muted">{fmtData(c.creato_il)}</td>
                      <td><Link className="btn btn--ghost btn--xs" href={href} onClick={(e) => e.stopPropagation()}>Apri <Icon name="arrowRight" /></Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </div>
        </div>
      )}
      <PagerUrl pagina={pagina} totale={totale} perPagina={perPagina} cosa="corsi" />
    </>
  );
}
