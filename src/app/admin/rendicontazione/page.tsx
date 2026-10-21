import Link from 'next/link';
import { fmtOre } from '@/lib/formato';
import type { Route } from 'next';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { computeReportFondoDataset } from '@/lib/report-fondo';
import { validateReportFondo, contaSeverita } from '@/lib/report-fondo-validazioni';
import { formatiDisponibili, getAdapter } from '@/lib/report-fondo-formati';
import { Icon, fmtDataOra } from '@/components/admin/Atlante';
import { DepositaPanel, type SnapshotRow } from './DepositaPanel';
import { PianiPanel, type PianoRow } from './PianiPanel';
import { RendicontazioneTabs } from '@/components/admin/SezioneTabs';

export const dynamic = 'force-dynamic';

type ComboRow = {
  edizione_id: string;
  piano_id: string;
  edizione: { id: string; codice: string; corso: { id: string; titolo: string } | null } | null;
  piano: { id: string; titolo: string; fondo: string | null; cup: string | null } | null;
};

export default async function ReportFondoPage(
  props: {
    searchParams: Promise<{ edizione?: string; piano?: string; formato?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const edizioneId = searchParams.edizione;
  const pianoId = searchParams.piano;
  const formato = searchParams.formato ?? 'fondimpresa';

  const { data: combosRaw } = await supabase
    .from('iscrizione')
    .select(
      `edizione_id, piano_id,
       edizione:edizione_id ( id, codice, corso:corso_id ( id, titolo ) ),
       piano:piano_id ( id, titolo, fondo, cup )`,
    )
    .not('piano_id', 'is', null)
    .returns<ComboRow[]>();

  const seen = new Set<string>();
  const combos: ComboRow[] = [];
  const iscrittiPerPiano = new Map<string, number>();
  for (const c of combosRaw ?? []) {
    iscrittiPerPiano.set(c.piano_id, (iscrittiPerPiano.get(c.piano_id) ?? 0) + 1);
    const k = `${c.edizione_id}|${c.piano_id}`;
    if (!seen.has(k)) { seen.add(k); combos.push(c); }
  }

  // Report già depositati per coppia (edizione, piano): si vedono nella lista.
  const { data: depRaw } = await supabase.from('report_fondo_depositato').select('edizione_id, piano_id');
  const depositiPer = new Map<string, number>();
  for (const d of depRaw ?? []) { const k = `${d.edizione_id}|${d.piano_id}`; depositiPer.set(k, (depositiPer.get(k) ?? 0) + 1); }

  const { count: nAttestati } = await supabase.from('attestato').select('id', { count: 'exact', head: true }).is('sostituito_da', null);

  const { data: pianiRaw } = await supabase
    .from('piano_formativo_finanziato')
    .select('id, titolo, codice, fondo, cup, avviso, canale')
    .order('titolo', { ascending: true })
    .returns<Omit<PianoRow, 'n_iscritti'>[]>();
  const piani: PianoRow[] = (pianiRaw ?? []).map((p) => ({ ...p, n_iscritti: iscrittiPerPiano.get(p.id) ?? 0 }));

  const dataset = edizioneId && pianoId ? await computeReportFondoDataset(supabase, edizioneId, pianoId) : null;
  const warnings = dataset ? validateReportFondo(dataset) : [];
  const sev = contaSeverita(warnings);
  const adapter = getAdapter(formato);

  let snapshots: SnapshotRow[] = [];
  if (dataset && edizioneId && pianoId) {
    const { data: snapsRaw } = await supabase
      .from('report_fondo_depositato')
      .select('id, formato, fondo, generato_at')
      .eq('edizione_id', edizioneId)
      .eq('piano_id', pianoId)
      .order('generato_at', { ascending: false })
      .returns<{ id: string; formato: string; fondo: string | null; generato_at: string }[]>();
    const ids = (snapsRaw ?? []).map((s) => s.id);
    const hashById: Record<string, string | null> = {};
    if (ids.length) {
      const { data: evs } = await supabase
        .from('evento')
        .select('subject_id, payload')
        .eq('event_type', 'report_fondo_depositato')
        .in('subject_id', ids)
        .returns<{ subject_id: string | null; payload: { hash?: string } | null }[]>();
      for (const e of evs ?? []) {
        if (e.subject_id) hashById[e.subject_id] = e.payload?.hash ?? null;
      }
    }
    snapshots = (snapsRaw ?? []).map((s) => ({ ...s, hash_evento: hashById[s.id] ?? null }));
  }

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <h1>Rendicontazione</h1>
          <p>
            Piani finanziati e report per i fondi. Il report si genera per una coppia edizione e piano: ore, frequenza,
            completamento e idoneità sono ricalcolati adesso dal registro. La generazione non scrive nulla: il deposito,
            che congela la prova consegnata al fondo, è un&apos;azione separata.
          </p>
        </div>
      </div>
      <RendicontazioneTabs nAttestati={nAttestati ?? 0} />

      {!(edizioneId && pianoId) && <PianiPanel piani={piani} />}

      {!(edizioneId && pianoId) && <div className="card">
        <div className="card__head">
          <h3>Edizioni finanziate</h3>
          <span className="chip chip--muted">{combos.length}</span>
        </div>
        <div className="card__body card__body--flush">
          {combos.length === 0 ? (
            <div className="card__body"><div className="muted">Nessun iscritto ha ancora un piano finanziato: si assegna dalla scheda Fondo dell&apos;edizione.</div></div>
          ) : (
            <div className="tbl-wrap"><table className="tbl tbl--zebra">
              <thead>
                <tr><th>Corso / Edizione</th><th>Piano</th><th>Fondo</th><th>CUP</th><th>Depositati</th><th style={{ width: 120 }}></th></tr>
              </thead>
              <tbody>
                {combos.map((c) => {
                  const nDep = depositiPer.get(`${c.edizione_id}|${c.piano_id}`) ?? 0;
                  return (
                    <tr key={`${c.edizione_id}|${c.piano_id}`}>
                      <td>
                        <span className="t-title">{c.edizione?.corso?.titolo ?? '—'}</span>
                        {c.edizione?.corso ? (
                          <Link className="mono muted" href={`/admin/corsi/${c.edizione.corso.id}/edizioni/${c.edizione_id}/fondo` as Route} title="Scheda Fondo dell'edizione"> · {c.edizione.codice}</Link>
                        ) : <span className="mono muted"> · —</span>}
                      </td>
                      <td>{c.piano?.titolo ?? '—'}</td>
                      <td>{c.piano?.fondo ?? <span className="muted">—</span>}</td>
                      <td>{c.piano?.cup ? <span className="mono">{c.piano.cup}</span> : <span className="chip chip--err">assente</span>}</td>
                      <td>{nDep > 0 ? <span className="chip chip--ok">{nDep}</span> : <span className="muted">—</span>}</td>
                      <td>
                        <Link className="btn btn--secondary btn--xs" href={`/admin/rendicontazione?edizione=${c.edizione_id}&piano=${c.piano_id}&formato=${formato}` as Route}>
                          Apri il report <Icon name="arrowRight" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </div>
      </div>}

      {edizioneId && pianoId && (
        <div className="row row--wrap" style={{ gap: 10, marginBottom: 14 }}>
          <Link className="btn btn--ghost btn--sm" href="/admin/rendicontazione"><Icon name="arrowLeft" /> Tutti i piani e le edizioni</Link>
          {dataset && combos.find((c) => c.edizione_id === edizioneId)?.edizione?.corso && (
            <Link className="btn btn--ghost btn--sm" href={`/admin/corsi/${combos.find((c) => c.edizione_id === edizioneId)!.edizione!.corso!.id}/edizioni/${edizioneId}/fondo` as Route}>Scheda Fondo dell&apos;edizione <Icon name="arrowRight" /></Link>
          )}
        </div>
      )}

      {edizioneId && pianoId && !dataset && (
        <div className="banner banner--err"><Icon name="alert" className="banner__icon" /><div className="banner__body">Questa coppia di edizione e piano non esiste o non è visibile: torna all&apos;elenco e riaprila da lì.</div></div>
      )}

      {dataset && (
        <>
          <div className="card">
            <div className="card__head"><div><h3>Report — {dataset.testata.corso_titolo} · {dataset.testata.edizione_codice}</h3><div className="sub">Dati calcolati adesso dal registro. Il file si genera in fondo; il deposito congela la copia consegnata al fondo.</div></div></div>
            <div className="card__body">
              <div className="grid-3" style={{ fontSize: 13 }}>
                <div><div className="lbl">Piano</div>{dataset.testata.piano_titolo}</div>
                <div><div className="lbl">Fondo</div>{dataset.testata.fondo ?? '—'}</div>
                <div><div className="lbl">Avviso</div>{dataset.testata.avviso ?? '—'}</div>
                <div><div className="lbl">CUP</div>{dataset.testata.cup ? <span className="mono">{dataset.testata.cup}</span> : <span className="chip chip--err">assente</span>}</div>
                <div><div className="lbl">Canale</div>{dataset.testata.canale ?? '—'}</div>
                <div><div className="lbl">Soglia frequenza</div>{dataset.testata.soglia_frequenza_percentuale ?? '—'}%</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <h3>Conformità</h3>
              <div className="row">
                <span className={`chip ${sev.bloccanti > 0 ? 'chip--err' : 'chip--muted'}`}>{sev.bloccanti} bloccanti</span>
                <span className={`chip ${sev.avvisi > 0 ? 'chip--ocra' : 'chip--muted'}`}>{sev.avvisi} avvisi</span>
              </div>
            </div>
            <div className="card__body">
              {/* B10: finché il formato è interim "nessun rilievo" non vuol dire "conforme". */}
              {adapter && !adapter.ufficiale && (
                <div className="banner banner--ocra"><Icon name="alert" className="banner__icon" /><div className="banner__body">Formato <strong>interim</strong>: il file contiene tutti i dati ma non è ancora il tracciato ufficiale del fondo. I controlli qui sotto riguardano i dati, non la conformità del file.</div></div>
              )}
              {warnings.length === 0 ? (
                <div className="banner banner--info"><Icon name="check" className="banner__icon" /><div className="banner__body">{adapter && !adapter.ufficiale ? 'Nessun rilievo sui dati: si può depositare lo snapshot, ma il file resta in formato interim.' : 'Nessun rilievo: pronto al deposito.'}</div></div>
              ) : (
                warnings.map((w, idx) => (
                  <div key={idx} className={`conform ${w.severita === 'bloccante' ? 'conform--err' : 'conform--warn'}`}>
                    <Icon name={w.severita === 'bloccante' ? 'x' : 'alert'} className="conform__icon" />
                    <div><strong style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.04em' }}>{w.severita}</strong> · {w.messaggio}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <h3>Iscritti</h3>
              <span className="chip chip--muted">{dataset.iscritti.length}</span>
            </div>
            <div className="card__body card__body--flush">
              <div className="tbl-wrap"><table className="tbl tbl--zebra">
                <thead>
                  <tr><th>Cognome Nome</th><th>Codice fiscale</th><th>Azienda</th><th>Frequenza</th><th>FAD</th><th>Idoneità</th></tr>
                </thead>
                <tbody>
                  {dataset.iscritti.map((i) => (
                    <tr key={i.iscrizione_id}>
                      <td className="t-title">{i.cognome} {i.nome}</td>
                      <td>{i.codice_fiscale ? <span className="mono">{i.codice_fiscale}</span> : <span className="chip chip--err">assente</span>}</td>
                      <td>
                        {i.azienda_ragione_sociale ?? <span className="chip chip--ocra">nessuna</span>}
                        {i.azienda_ragione_sociale && !i.azienda_partita_iva && <span className="chip chip--ocra" style={{ marginLeft: 6 }}>no P.IVA</span>}
                      </td>
                      <td>{i.frequenza_percentuale.toLocaleString('it-IT')}% <span className="muted">({fmtOre(i.ore_frequentate)})</span></td>
                      <td className="muted">{i.obbligatori_totale > 0 ? `${i.obbligatori_completati}/${i.obbligatori_totale}` : '—'}</td>
                      <td>
                        <span className={`chip ${i.idoneo ? 'chip--teal' : 'chip--ocra'}`}>{i.idoneo ? 'idoneo' : 'non idoneo'}</span>
                        <div className="muted" style={{ fontSize: 11 }}>{i.criterio_idoneita}</div>
                      </td>
                    </tr>
                  ))}
                  {dataset.iscritti.length === 0 && (
                    <tr><td colSpan={6} className="muted" style={{ padding: 18 }}>Nessun iscritto per questa coppia.</td></tr>
                  )}
                </tbody>
              </table></div>
            </div>
          </div>

          {dataset.sessioni.length > 0 && (
            <div className="card">
              <div className="card__head"><h3>Sessioni</h3><span className="chip chip--muted">{dataset.sessioni.length}</span></div>
              <div className="card__body card__body--flush">
                <div className="tbl-wrap"><table className="tbl tbl--zebra">
                  <thead><tr><th>Titolo</th><th>Quando</th><th>Durata</th><th>Modalità</th><th>Docente</th></tr></thead>
                  <tbody>
                    {dataset.sessioni.map((s) => (
                      <tr key={s.sessione_id}>
                        <td>{s.titolo}{s.annullata && <span className="chip chip--err" style={{ marginLeft: 6 }}>annullata</span>}</td>
                        <td className="muted">{fmtDataOra(s.data_ora)}</td>
                        <td className="muted">{s.durata_minuti != null ? `${s.durata_minuti}′` : '—'}</td>
                        <td><span className="chip chip--muted">{s.modalita}</span></td>
                        <td>{s.docente ?? <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card__head"><h3>Genera file</h3></div>
            <div className="card__body">
              <div className="row row--wrap" style={{ marginBottom: 12 }}>
                <span className="filterset__label">Formato</span>
                <div className="seg seg--mono">
                  {formatiDisponibili().map((a) => (
                    <Link
                      key={a.fondo}
                      href={`/admin/rendicontazione?edizione=${edizioneId}&piano=${pianoId}&formato=${a.fondo}` as Route}
                      className={a.fondo === formato ? 'is-active' : ''}
                    >
                      {a.etichetta}
                    </Link>
                  ))}
                </div>
              </div>
              {adapter && !adapter.ufficiale && (
                <div className="banner banner--ocra">
                  <Icon name="alert" className="banner__icon" />
                  <div className="banner__body">
                    Formato <strong>interim</strong>: contiene tutti i dati, ma intestazioni e ordine
                    colonne non sono il tracciato ufficiale del fondo (cambia per avviso). Da recepire
                    dalla documentazione ufficiale prima della consegna reale.
                  </div>
                </div>
              )}
              <a className="btn" href={`/api/admin/report-fondo/genera?edizione=${edizioneId}&piano=${pianoId}&formato=${formato}`}>
                <Icon name="download" /> Scarica {adapter?.etichetta ?? formato}
              </a>
              <div className="field__hint" style={{ marginTop: 10 }}>
                La generazione è una vista calcolata adesso e non scrive nel log. Per congelare la
                prova consegnata al fondo usa il deposito qui sotto.
              </div>
            </div>
          </div>

          <DepositaPanel edizione={edizioneId!} piano={pianoId!} formato={formato} bloccanti={sev.bloccanti} snapshots={snapshots} />
        </>
      )}
    </>
  );
}
