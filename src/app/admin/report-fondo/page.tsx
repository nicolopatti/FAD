import Link from 'next/link';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { computeReportFondoDataset } from '@/lib/report-fondo';
import { validateReportFondo, contaSeverita } from '@/lib/report-fondo-validazioni';
import { formatiDisponibili, getAdapter } from '@/lib/report-fondo-formati';
import { DepositaPanel, type SnapshotRow } from './DepositaPanel';

export const dynamic = 'force-dynamic';

type ComboRow = {
  edizione_id: string;
  piano_id: string;
  edizione: { id: string; codice: string; corso: { id: string; titolo: string } | null } | null;
  piano: { id: string; titolo: string; fondo: string | null; cup: string | null } | null;
};

function fmtData(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function ReportFondoPage({
  searchParams,
}: {
  searchParams: { edizione?: string; piano?: string; formato?: string };
}) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const edizioneId = searchParams.edizione;
  const pianoId = searchParams.piano;
  const formato = searchParams.formato ?? 'fondimpresa';

  // Coppie (Edizione, Piano) finanziate: dedotte dalle Iscrizioni con piano_id (D27).
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
  for (const c of combosRaw ?? []) {
    const k = `${c.edizione_id}|${c.piano_id}`;
    if (!seen.has(k)) {
      seen.add(k);
      combos.push(c);
    }
  }

  const dataset = edizioneId && pianoId ? await computeReportFondoDataset(supabase, edizioneId, pianoId) : null;
  const warnings = dataset ? validateReportFondo(dataset) : [];
  const sev = contaSeverita(warnings);
  const adapter = getAdapter(formato);

  // Snapshot già depositati per la coppia (+ hash attestato nell'Evento).
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
      <h1>Report fondi</h1>
      <p className="muted">
        Genera la rendicontazione per una coppia <strong>(Edizione, Piano)</strong> finanziata. I dati
        (ore, frequenza, completamento, idoneità) sono <em>ricalcolati adesso dagli Eventi</em> (D8/D35),
        l&apos;anagrafica è risolta al momento. La generazione non scrive nulla nel log: il deposito
        write-once (con Evento e hash) è un&apos;azione separata.
      </p>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Edizioni finanziate ({combos.length})</h3>
        {combos.length === 0 ? (
          <div className="muted">Nessuna iscrizione con piano finanziato.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Corso / Edizione</th>
                <th>Piano</th>
                <th>Fondo</th>
                <th>CUP</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {combos.map((c) => {
                const selected = c.edizione_id === edizioneId && c.piano_id === pianoId;
                return (
                  <tr key={`${c.edizione_id}|${c.piano_id}`}>
                    <td>
                      {c.edizione?.corso?.titolo ?? '—'}
                      <span className="mono"> · {c.edizione?.codice ?? '—'}</span>
                    </td>
                    <td>{c.piano?.titolo ?? '—'}</td>
                    <td>{c.piano?.fondo ?? <span className="muted">—</span>}</td>
                    <td>{c.piano?.cup ?? <span className="badge bad">assente</span>}</td>
                    <td>
                      <Link href={`/admin/report-fondo?edizione=${c.edizione_id}&piano=${c.piano_id}&formato=${formato}`}>
                        {selected ? 'Selezionata' : 'Anteprima →'}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {edizioneId && pianoId && !dataset && (
        <div className="alert">Edizione/Piano non leggibili (RLS o inesistenti).</div>
      )}

      {dataset && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>
              Testata — {dataset.testata.corso_titolo} · {dataset.testata.edizione_codice}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: '0.9em' }}>
              <div><span className="muted">Piano:</span> {dataset.testata.piano_titolo}</div>
              <div><span className="muted">Fondo:</span> {dataset.testata.fondo ?? '—'}</div>
              <div><span className="muted">Avviso:</span> {dataset.testata.avviso ?? '—'}</div>
              <div><span className="muted">CUP:</span> {dataset.testata.cup ?? <span className="badge bad">assente</span>}</div>
              <div><span className="muted">Canale:</span> {dataset.testata.canale ?? '—'}</div>
              <div><span className="muted">Codice piano:</span> {dataset.testata.piano_codice ?? '—'}</div>
              <div><span className="muted">Soglia freq.:</span> {dataset.testata.soglia_frequenza_percentuale ?? '—'}%</div>
              <div><span className="muted">Periodo piano:</span> {dataset.testata.piano_data_avvio ?? '—'} → {dataset.testata.piano_data_chiusura ?? '—'}</div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>
              Conformità — {sev.bloccanti} bloccanti · {sev.avvisi} avvisi
            </h3>
            {warnings.length === 0 ? (
              <div className="badge ok">Nessun warning: pronto al deposito.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {warnings.map((w, idx) => (
                  <li key={idx} style={{ marginBottom: 4 }}>
                    <span className={`badge ${w.severita === 'bloccante' ? 'bad' : 'warn'}`}>{w.severita}</span>{' '}
                    {w.messaggio}
                  </li>
                ))}
              </ul>
            )}
            {sev.bloccanti > 0 && (
              <p className="muted" style={{ fontSize: '0.85em', marginBottom: 0 }}>
                I warning bloccanti andranno confermati esplicitamente prima del deposito definitivo.
                L&apos;anteprima e la generazione del file restano comunque consentite.
              </p>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Iscritti ({dataset.iscritti.length})</h3>
            <table>
              <thead>
                <tr>
                  <th>Cognome Nome</th>
                  <th>Codice fiscale</th>
                  <th>Azienda</th>
                  <th>Frequenza</th>
                  <th>FAD</th>
                  <th>Idoneità</th>
                </tr>
              </thead>
              <tbody>
                {dataset.iscritti.map((i) => (
                  <tr key={i.iscrizione_id}>
                    <td>{i.cognome} {i.nome}</td>
                    <td className="mono">{i.codice_fiscale ?? <span className="badge bad">assente</span>}</td>
                    <td>
                      {i.azienda_ragione_sociale ?? <span className="badge warn">nessuna</span>}
                      {i.azienda_ragione_sociale && !i.azienda_partita_iva && (
                        <span className="badge warn" style={{ marginLeft: 6 }}>no P.IVA</span>
                      )}
                    </td>
                    <td>
                      {i.frequenza_percentuale}% <span className="muted">({i.ore_frequentate}h)</span>
                    </td>
                    <td className="muted">
                      {i.obbligatori_totale > 0 ? `${i.obbligatori_completati}/${i.obbligatori_totale}` : '—'}
                    </td>
                    <td>
                      <span className={`badge ${i.idoneo ? 'ok' : 'warn'}`}>{i.idoneo ? 'idoneo' : 'non idoneo'}</span>
                      <div className="muted" style={{ fontSize: '0.8em' }}>{i.criterio_idoneita}</div>
                    </td>
                  </tr>
                ))}
                {dataset.iscritti.length === 0 && (
                  <tr><td colSpan={6} className="muted">Nessun iscritto per questa coppia.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Sessioni ({dataset.sessioni.length})</h3>
            {dataset.sessioni.length === 0 ? (
              <div className="muted">Nessuna sessione (corso FAD puro).</div>
            ) : (
              <table>
                <thead>
                  <tr><th>Titolo</th><th>Quando</th><th>Durata</th><th>Modalità</th><th>Docente</th></tr>
                </thead>
                <tbody>
                  {dataset.sessioni.map((s) => (
                    <tr key={s.sessione_id}>
                      <td>{s.titolo}{s.annullata && <span className="badge bad" style={{ marginLeft: 6 }}>annullata</span>}</td>
                      <td className="muted">{fmtData(s.data_ora)}</td>
                      <td className="muted">{s.durata_minuti != null ? `${s.durata_minuti}′` : '—'}</td>
                      <td><span className="badge muted">{s.modalita}</span></td>
                      <td>{s.docente ?? <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Genera file</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <span className="muted">Formato:</span>
              {formatiDisponibili().map((a) => (
                <Link
                  key={a.fondo}
                  href={`/admin/report-fondo?edizione=${edizioneId}&piano=${pianoId}&formato=${a.fondo}`}
                  className={`badge ${a.fondo === formato ? '' : 'muted'}`}
                >
                  {a.etichetta}
                </Link>
              ))}
            </div>
            {adapter && !adapter.ufficiale && (
              <div className="alert" style={{ marginBottom: 10 }}>
                ⚠️ Formato <strong>interim</strong>: contiene tutti i dati di rendicontazione, ma intestazioni e
                ordine colonne <strong>non sono il tracciato ufficiale</strong> del fondo. Il tracciato per
                avviso va recepito dalla documentazione ufficiale aggiornata (runbook §10) prima della
                consegna reale al fondo.
              </div>
            )}
            <a
              className="btn"
              href={`/api/admin/report-fondo/genera?edizione=${edizioneId}&piano=${pianoId}&formato=${formato}`}
            >
              Scarica {adapter?.etichetta ?? formato}
            </a>
            <p className="muted" style={{ fontSize: '0.85em', marginTop: 10, marginBottom: 0 }}>
              La generazione è una vista calcolata adesso e non scrive nulla nel log. Per congelare la
              prova consegnata al fondo usa il <strong>deposito</strong> qui sotto.
            </p>
          </div>

          <DepositaPanel
            edizione={edizioneId!}
            piano={pianoId!}
            formato={formato}
            bloccanti={sev.bloccanti}
            snapshots={snapshots}
          />
        </>
      )}
    </>
  );
}
