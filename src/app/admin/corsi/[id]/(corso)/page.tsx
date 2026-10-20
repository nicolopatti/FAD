import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import { corsoStato, edizioneStato, STATO_CORSO_LABEL, type CorsoRow, type EdizioneRow } from '@/lib/db-types';
import { Icon, Cover, coverUrl, fmtData, fmtDurataSec } from '@/components/admin/Atlante';
import { edizioneHref } from '../_components/shared';

export const dynamic = 'force-dynamic';

type StrutturaMini = { learning_object: { type: string; config: Record<string, unknown> } | null; obbligatorio: boolean };

/** Panoramica del corso: copertina, descrizione, numeri, edizioni attive con prontezza. */
export default async function CorsoPanoramicaPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data: corso } = await supabase
    .from('corso')
    .select('id, tenant_id, titolo, descrizione, sblocco_sequenziale, visione_integrale, categoria, cover_path, ore_totali, riferimento_normativo, politica_attestato, creato_il')
    .eq('id', params.id)
    .maybeSingle<CorsoRow>();
  if (!corso) notFound();

  const [struttura, edizioni] = await Promise.all([
    supabase.from('struttura_corso').select('obbligatorio, learning_object:learning_object_id ( type, config )').eq('corso_id', corso.id).returns<StrutturaMini[]>().then((r) => unwrap(r, 'le lezioni')),
    supabase.from('edizione').select('id, tenant_id, corso_id, codice, data_inizio, data_fine, fad_apertura, fad_chiusura, concluso_at, annullato_at, creato_il').eq('corso_id', corso.id).order('creato_il', { ascending: false }).returns<EdizioneRow[]>().then((r) => unwrap(r, 'le edizioni')),
  ]);
  const stato = corsoStato(edizioni);
  const attive = edizioni.filter((e) => edizioneStato(e) === 'attiva');
  const ids = attive.map((e) => e.id);

  // Prontezza delle edizioni attive: iscritti, sessioni, piano, attestati.
  const [iscr, sess, att] = ids.length
    ? await Promise.all([
        supabase.from('iscrizione').select('edizione_id, piano_id').in('edizione_id', ids).then((r) => unwrap(r, 'gli iscritti')),
        supabase.from('sessione').select('edizione_id').in('edizione_id', ids).is('annullato_at', null).then((r) => unwrap(r, 'le sessioni')),
        supabase.from('attestato').select('edizione_id').in('edizione_id', ids).is('sostituito_da', null).then((r) => unwrap(r, 'gli attestati')),
      ])
    : [[], [], []];
  const conta = (rows: { edizione_id: string }[], id: string) => rows.filter((r) => r.edizione_id === id).length;

  const durata = struttura.reduce((acc, s) => acc + (s.learning_object?.type === 'video' && typeof s.learning_object.config?.durata_secondi === 'number' ? (s.learning_object.config.durata_secondi as number) : 0), 0);
  const obbligatorie = struttura.filter((s) => s.obbligatorio).length;
  const base = `/admin/corsi/${corso.id}` as const;

  return (
    <div className="grid-2-380">
      <div>
        <div className="card">
          <div className="card__body">
            <div className="corso-intro">
              <Cover categoria={corso.categoria} src={coverUrl(corso.cover_path)} style={{ height: 140, borderRadius: 12 }} />
              <div>
                {corso.descrizione ? <p style={{ margin: 0 }}>{corso.descrizione}</p> : <p className="muted" style={{ margin: 0 }}>Nessuna descrizione: è il testo che il discente legge nella pagina del corso. <Link href={`${base}/impostazioni`}>Scrivila</Link>.</p>}
                <div className="head-chips">
                  {corso.categoria && <span className="chip chip--muted">{corso.categoria}</span>}
                  <span className="chip chip--muted">{corso.sblocco_sequenziale ? 'Sblocco sequenziale' : 'Lezioni libere'}</span>
                  {corso.visione_integrale && <span className="chip chip--muted">Visione integrale</span>}
                  {corso.ore_totali != null && <span className="chip chip--muted">{String(corso.ore_totali).replace('.', ',')} ore</span>}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card__head">
            <h3>Edizioni attive</h3>
            <Link className="btn btn--ghost btn--sm" href={`${base}/edizioni`}>Tutte le edizioni <Icon name="arrowRight" /></Link>
          </div>
          <div className="card__body">
            {attive.length === 0 ? (
              <div className="empty">
                <Icon name="calendar" className="empty__icon" />
                <div className="empty__t">{stato === 'bozza' ? 'Corso in bozza' : 'Nessuna edizione attiva'}</div>
                <div className="empty__s">{stato === 'bozza' ? 'Completa le lezioni, poi crea la prima edizione per iscrivere le persone.' : 'Le edizioni passate sono concluse o annullate. Crea una nuova edizione per riaprire il corso.'}</div>
                <div className="empty__action"><Link className="btn" href={`${base}/edizioni?nuova=1`}><Icon name="plus" /> Nuova edizione</Link></div>
              </div>
            ) : (
              <div className="tbl-wrap"><table className="tbl tbl--zebra">
                <thead><tr><th>Edizione</th><th>Date</th><th>Prontezza</th><th></th></tr></thead>
                <tbody>
                  {attive.map((e) => {
                    const nI = conta(iscr, e.id);
                    const nP = iscr.filter((i) => i.edizione_id === e.id && i.piano_id).length;
                    const nS = conta(sess, e.id);
                    const nA = conta(att, e.id);
                    const href = edizioneHref(corso.id, e.id);
                    return (
                      <tr key={e.id}>
                        <td><Link className="t-link mono" href={href}>{e.codice}</Link></td>
                        <td className="muted">{e.data_inizio || e.data_fine ? `${fmtData(e.data_inizio)} → ${fmtData(e.data_fine)}` : '—'}</td>
                        <td>
                          <ul className="ready">
                            <li className={nI > 0 ? 'is-ok' : 'is-todo'}><span className="ready__dot"><Icon name={nI > 0 ? 'check' : 'alert'} /></span>{nI > 0 ? `${nI} iscritt${nI === 1 ? 'o' : 'i'}` : <Link href={href}>Nessun iscritto</Link>}</li>
                            <li className={nS > 0 ? 'is-ok' : ''}><span className="ready__dot"><Icon name={nS > 0 ? 'check' : 'calendar'} /></span>{nS > 0 ? `${nS} session${nS === 1 ? 'e' : 'i'}` : <Link href={`${href}/sessioni`}>Nessuna sessione</Link>}</li>
                            <li className={nP > 0 ? 'is-ok' : ''}><span className="ready__dot"><Icon name={nP > 0 ? 'check' : 'euro'} /></span>{nP > 0 ? `${nP} su ${nI} con piano finanziato` : <Link href={`${href}/fondo`}>Nessun piano finanziato</Link>}</li>
                            {(corso.politica_attestato ?? 'automatica') !== 'nessuna' && (
                              <li className={nA > 0 ? 'is-ok' : ''}><span className="ready__dot"><Icon name={nA > 0 ? 'check' : 'shield'} /></span>{nA} attestat{nA === 1 ? 'o emesso' : 'i emessi'}</li>
                            )}
                          </ul>
                        </td>
                        <td><Link className="btn btn--ghost btn--xs" href={href}>Apri <Icon name="arrowRight" /></Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="card">
          <div className="card__head"><h3>In sintesi</h3></div>
          <div className="card__body">
            <div className="tbl-wrap"><table className="tbl">
              <tbody>
                <tr><th style={{ width: 140 }}>Stato</th><td>{STATO_CORSO_LABEL[stato]}</td></tr>
                <tr><th>Lezioni</th><td><Link href={`${base}/lezioni`}>{struttura.length}</Link>{struttura.length > 0 && <span className="muted"> · {obbligatorie} obbligatori{obbligatorie === 1 ? 'a' : 'e'}</span>}</td></tr>
                <tr><th>Video</th><td>{durata > 0 ? fmtDurataSec(durata) : <span className="muted">—</span>}</td></tr>
                <tr><th>Edizioni</th><td><Link href={`${base}/edizioni`}>{edizioni.length}</Link>{attive.length > 0 && <span className="muted"> · {attive.length} attiv{attive.length === 1 ? 'a' : 'e'}</span>}</td></tr>
                <tr><th>Attestato</th><td>{(corso.politica_attestato ?? 'automatica') === 'nessuna' ? 'Nessuno' : (corso.politica_attestato ?? 'automatica') === 'manuale' ? 'Manuale' : 'Automatico'}{(corso.politica_attestato ?? 'automatica') !== 'nessuna' && corso.ore_totali == null && <div className="muted" style={{ fontSize: 12 }}>Ore totali mancanti: <Link href={`${base}/attestato`}>compilale</Link>.</div>}</td></tr>
                <tr><th>Creato il</th><td className="muted">{fmtData(corso.creato_il)}</td></tr>
              </tbody>
            </table></div>
          </div>
        </div>

        {stato === 'bozza' && (
          <div className="card">
            <div className="card__head"><h3>Prossimi passi</h3></div>
            <div className="card__body">
              <ul className="ready">
                <li className={struttura.length > 0 ? 'is-ok' : 'is-todo'}><span className="ready__dot"><Icon name={struttura.length > 0 ? 'check' : 'alert'} /></span><Link href={`${base}/lezioni`}>Aggiungi le lezioni</Link></li>
                <li className={corso.descrizione ? 'is-ok' : 'is-todo'}><span className="ready__dot"><Icon name={corso.descrizione ? 'check' : 'alert'} /></span><Link href={`${base}/impostazioni`}>Scrivi la descrizione</Link></li>
                <li className={(corso.politica_attestato ?? 'automatica') === 'nessuna' || corso.ore_totali != null ? 'is-ok' : 'is-todo'}><span className="ready__dot"><Icon name={(corso.politica_attestato ?? 'automatica') === 'nessuna' || corso.ore_totali != null ? 'check' : 'alert'} /></span><Link href={`${base}/attestato`}>Ore e attestato</Link></li>
                <li className="is-todo"><span className="ready__dot"><Icon name="calendar" /></span><Link href={`${base}/edizioni?nuova=1`}>Crea la prima edizione</Link></li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
