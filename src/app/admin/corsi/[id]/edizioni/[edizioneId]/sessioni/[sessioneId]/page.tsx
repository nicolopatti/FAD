import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import { RUOLI_DIDATTICI, type IncaricoConPersona, type SessioneRow } from '@/lib/db-types';
import { Crumb } from '@/components/AppShell';
import { Icon, fmtDataOra } from '@/components/admin/Atlante';
import { CsvImportForm } from './CsvImportForm';
import { CodaResolver, type CodaItem, type IscrittoOption } from './CodaResolver';
import { PresenzeManager, type PresenzaItem } from './PresenzeManager';
import { SessioneDettagli } from './SessioneDettagli';

export const dynamic = 'force-dynamic';

type SessioneJoin = SessioneRow & { edizione: { id: string; codice: string; corso: { id: string; titolo: string } | null } | null };
type GrezzoConContenuto = { id: string; fonte: string; importato_da: string | null; creato_il: string; contenuto: unknown };
type CodaRowDb = { id: string; riga: number; tipo: 'ambiguo' | 'assente'; candidati: string[]; grezzo_id: string };
type IscrittoDb = { id: string; persona: { nome: string; cognome: string; email: string } | null };

/**
 * Pagina della sessione, sotto l'edizione, nell'ordine del lavoro: dettagli e
 * docente, import del report, coda da risolvere, presenze, storico degli import.
 */
export default async function SessioneDetailPage(
  props: { params: Promise<{ id: string; edizioneId: string; sessioneId: string }> }
) {
  const params = await props.params;
  const session = await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: sessione } = await supabase
    .from('sessione')
    .select('id, tenant_id, edizione_id, titolo, data_ora, durata_minuti, modalita, vcs_piattaforma, vcs_meeting_id, incarico_id, annullato_at, creato_il, edizione:edizione_id ( id, codice, corso:corso_id ( id, titolo ) )')
    .eq('id', params.sessioneId)
    .eq('edizione_id', params.edizioneId)
    .maybeSingle<SessioneJoin>();
  if (!sessione || !sessione.edizione?.corso || sessione.edizione.corso.id !== params.id) notFound();
  const edizioneId = sessione.edizione.id;
  const baseEd = `/admin/corsi/${params.id}/edizioni/${edizioneId}` as const;

  const [grezziRaw, iscrittiDb, codaDb, incarichi, presEvt] = await Promise.all([
    supabase.from('report_partecipazione_grezzo').select('id, fonte, importato_da, creato_il, contenuto').eq('sessione_id', sessione.id).order('creato_il', { ascending: false }).returns<GrezzoConContenuto[]>().then((r) => unwrap(r, 'i report importati')),
    supabase.from('iscrizione').select('id, persona:persona_id ( nome, cognome, email )').eq('edizione_id', edizioneId).returns<IscrittoDb[]>().then((r) => unwrap(r, 'gli iscritti')),
    supabase.from('coda_riconciliazione').select('id, riga, tipo, candidati, grezzo_id').eq('sessione_id', sessione.id).is('risolto_at', null).order('riga', { ascending: true }).returns<CodaRowDb[]>().then((r) => unwrap(r, 'la coda')),
    supabase.from('incarico').select('id, edizione_id, persona_id, ruolo, persona:persona_id ( nome, cognome, email )').eq('edizione_id', edizioneId).returns<IncaricoConPersona[]>().then((r) => unwrap(r, 'gli incarichi')),
    supabase.from('evento').select('id, event_type, payload').eq('subject_id', sessione.id).in('event_type', ['presenza_webinar_registrata', 'presenza_inserita_manualmente', 'presenza_corretta_manualmente']).order('seq', { ascending: true })
      .returns<{ id: string; event_type: string; payload: { iscrizione_id?: string; durata?: string | null; corregge_evento_id?: string | null } | null }[]>()
      .then((r) => unwrap(r, 'le presenze')),
  ]);

  const grezzi = grezziRaw.map((g) => ({ id: g.id, fonte: g.fonte, importato_da: g.importato_da, creato_il: g.creato_il, righe: Array.isArray(g.contenuto) ? g.contenuto.length : null }));
  const rowByKey = new Map<string, { nome: string | null; email: string | null }>();
  for (const g of grezziRaw) {
    if (!Array.isArray(g.contenuto)) continue;
    for (const r of g.contenuto as { riga?: number; nome?: string; email?: string | null }[]) {
      if (r?.riga == null) continue;
      rowByKey.set(`${g.id}:${r.riga}`, { nome: r.nome ?? null, email: r.email ?? null });
    }
  }
  const labelOf = (i: IscrittoDb): string => (i.persona ? `${i.persona.nome} ${i.persona.cognome} (${i.persona.email})` : i.id);
  const iscrittiById = new Map<string, IscrittoOption>();
  const tuttiIscritti: IscrittoOption[] = iscrittiDb.map((i) => { const opt = { id: i.id, label: labelOf(i) }; iscrittiById.set(i.id, opt); return opt; });
  const codaItems: CodaItem[] = codaDb.map((c) => {
    const row = rowByKey.get(`${c.grezzo_id}:${c.riga}`);
    return { id: c.id, riga: c.riga, tipo: c.tipo, rowNome: row?.nome ?? null, rowEmail: row?.email ?? null, candidati: (Array.isArray(c.candidati) ? c.candidati : []).map((id) => iscrittiById.get(id)).filter((x): x is IscrittoOption => Boolean(x)) };
  });
  const supersededIds = new Set<string>();
  for (const e of presEvt) { const ref = e.payload?.corregge_evento_id; if (ref) supersededIds.add(ref); }
  const presenze: PresenzaItem[] = presEvt.map((e) => ({
    id: e.id,
    iscrizioneLabel: (e.payload?.iscrizione_id && iscrittiById.get(e.payload.iscrizione_id)?.label) || '(iscritto?)',
    durata: e.payload?.durata ?? null,
    origine: e.event_type === 'presenza_inserita_manualmente' ? 'manuale' : e.event_type === 'presenza_corretta_manualmente' ? 'corretta' : 'automatica',
    superseded: supersededIds.has(e.id),
  }));
  const docenti = incarichi.filter((i) => RUOLI_DIDATTICI.includes(i.ruolo));

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <Crumb items={[{ label: 'Corsi', href: '/admin/corsi' }, { label: sessione.edizione.corso.titolo, href: `/admin/corsi/${params.id}` }, { label: sessione.edizione.codice, href: baseEd }, { label: 'Sessioni', href: `${baseEd}/sessioni` }, { label: sessione.titolo }]} />
          <h1>
            {sessione.titolo}
            {sessione.annullato_at && <span className="chip chip--err" style={{ marginLeft: 12, verticalAlign: 'middle' }}>annullata</span>}
          </h1>
          <div className="head-chips">
            {sessione.modalita === 'vcs' ? <span className="chip chip--teal">Webinar · {sessione.vcs_piattaforma ?? '?'}</span> : <span className="chip chip--ocra">Aula</span>}
            <span>{fmtDataOra(sessione.data_ora)}{sessione.durata_minuti != null && ` · ${sessione.durata_minuti} min`}</span>
          </div>
        </div>
        <div className="page-head__actions">
          <Link className="btn btn--secondary" href={`${baseEd}/sessioni`}><Icon name="arrowLeft" /> Sessioni dell&apos;edizione</Link>
        </div>
      </div>

      <SessioneDettagli sessione={sessione} docenti={docenti} />

      {sessione.annullato_at ? (
        <div className="banner banner--ocra">
          <Icon name="alert" className="banner__icon" />
          <div className="banner__body">Sessione <strong>annullata</strong> il {fmtDataOra(sessione.annullato_at)}: non si importano report né si registrano o correggono presenze. Quanto già registrato resta consultabile.</div>
        </div>
      ) : (
        <CsvImportForm sessioneId={sessione.id} />
      )}
      {(codaItems.length > 0 || grezzi.length > 0) && <CodaResolver items={codaItems} tuttiIscritti={tuttiIscritti} />}
      <PresenzeManager sessioneId={sessione.id} presenze={presenze} tuttiIscritti={tuttiIscritti} aperta={!sessione.annullato_at} />
      <div className="card">
        <div className="card__head">
          <div>
            <h3>Report di partecipazione importati</h3>
            <div className="sub">Ogni import è una prova immutabile; l&apos;impronta del contenuto è nel registro. Le presenze si attribuiscono in automatico all&apos;import; le righe non risolte finiscono nella coda.</div>
          </div>
          <span className="chip chip--muted">{grezzi.length}</span>
        </div>
        <div className="card__body card__body--flush">
          {grezzi.length === 0 ? (
            <div className="card__body"><div className="muted">Nessun report importato per questa sessione.</div></div>
          ) : (
            <div className="tbl-wrap"><table className="tbl tbl--zebra">
              <thead><tr><th>Importato il</th><th>Fonte</th><th>Righe</th><th>Importato da</th></tr></thead>
              <tbody>
                {grezzi.map((g) => (
                  <tr key={g.id}>
                    <td className="muted">{fmtDataOra(g.creato_il)}</td>
                    <td><span className="chip chip--muted">{g.fonte}</span></td>
                    <td>{g.righe ?? '—'}</td>
                    <td>{g.importato_da === session.personaId ? 'tu' : g.importato_da ? 'un altro amministratore' : 'automatico'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      </div>
    </>
  );
}
