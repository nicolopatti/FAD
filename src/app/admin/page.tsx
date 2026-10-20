import Link from 'next/link';
import type { Route } from 'next';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import type { EdizioneRiepilogo } from '@/lib/db-types';
import { Icon, fmtData, fmtDataOra, fmtTempoRelativo } from '@/components/admin/Atlante';

export const dynamic = 'force-dynamic';

type EventoMini = { seq: number; event_type: string; occurred_at: string; payload: Record<string, unknown> | null };
type EdizioneAttiva = EdizioneRiepilogo & { corso: { id: string; titolo: string; archiviato_at: string | null } | null };
type SessioneProssima = { id: string; titolo: string; data_ora: string; modalita: string; edizione: { id: string; codice: string; corso: { id: string; titolo: string } | null } | null };

const EDIZIONI_IN_DASHBOARD = 12;

function activityView(ev: EventoMini): { ico: string; node: React.ReactNode } | null {
  const p = ev.payload ?? {};
  const titolo = typeof p.titolo === 'string' ? p.titolo : null;
  const nome = typeof p.nome === 'string' ? p.nome : null;
  const codice = typeof p.codice === 'string' ? p.codice : null;
  const loTitolo = typeof p.lo_titolo === 'string' ? p.lo_titolo : null;
  const n = typeof p.aggiunti === 'number' ? p.aggiunti : typeof p.righe === 'number' ? p.righe : null;
  const strong = (s: string | null) => (s ? <strong>{s}</strong> : null);

  switch (ev.event_type) {
    case 'corso.created':
      return p.duplicato_da ? { ico: 'copy', node: <>Duplicato un corso: {strong(titolo)}</> } : { ico: 'plus', node: <>Creato il corso {strong(titolo)}</> };
    case 'corso.updated': return { ico: 'corsi', node: <>Aggiornato il corso {strong(titolo)}</> };
    case 'corso.archived': return { ico: 'archive', node: <>Archiviato il corso {strong(titolo)}</> };
    case 'corso.unarchived': return { ico: 'archive', node: <>Ripristinato il corso {strong(titolo)}</> };
    case 'categoria.created': return { ico: 'plus', node: <>Nuova categoria {strong(nome)}</> };
    case 'categoria.updated': return { ico: 'edit', node: <>Categoria rinominata in {strong(nome)}</> };
    case 'categoria.removed': return { ico: 'x', node: <>Eliminata la categoria {strong(nome)}</> };
    case 'edizione.updated': return { ico: 'edit', node: <>Modificata l&apos;edizione <span className="mono">{codice}</span></> };
    case 'iscrizione.updated': return { ico: 'euro', node: <>{p.piano_id ? 'Assegnato un piano finanziato a un iscritto' : 'Tolto il piano finanziato a un iscritto'}</> };
    case 'edizione.piano_assegnato': return { ico: 'euro', node: <>Piano finanziato assegnato a tutta un&apos;edizione</> };
    case 'piano.created': return { ico: 'euro', node: <>Nuovo piano finanziato: {strong(titolo)}</> };
    case 'corso.cover_updated': return { ico: 'image', node: <>Aggiornata la copertina di un corso</> };
    case 'learning_object.created': return { ico: 'upload', node: <>Nuovo contenuto in libreria: {strong(titolo)}</> };
    case 'learning_object.archived': return { ico: 'archive', node: <>Archiviato il contenuto {strong(titolo)}</> };
    case 'learning_object.unarchived': return { ico: 'archive', node: <>Ripristinato il contenuto {strong(titolo)}</> };
    case 'struttura.added': return { ico: 'plus', node: <>Aggiunta la lezione {strong(loTitolo)} a un corso</> };
    case 'struttura.removed': return { ico: 'x', node: <>Tolta una lezione da un corso</> };
    case 'struttura.reordered': return { ico: 'grip', node: <>Riordinate le lezioni di un corso</> };
    case 'struttura.imported': return { ico: 'upload', node: <>Importate {n ?? 'più'} lezioni in un corso</> };
    case 'edizione.created': return { ico: 'calendar', node: <>Creata l&apos;edizione <span className="mono">{codice}</span></> };
    case 'edizione.concluded': return { ico: 'check', node: <>Conclusa l&apos;edizione <span className="mono">{codice}</span></> };
    case 'edizione.cancelled': return { ico: 'x', node: <>Annullata l&apos;edizione <span className="mono">{codice}</span></> };
    case 'iscrizione.created': return { ico: 'users', node: <>Nuovo iscritto a un&apos;edizione</> };
    case 'iscrizione.removed': return { ico: 'x', node: <>Rimosso un iscritto da un&apos;edizione</> };
    case 'iscrizione.imported': return { ico: 'users', node: <>Importati {n ?? 'più'} iscritti</> };
    case 'persona.invitata': return { ico: 'users', node: <>Inviata un&apos;email di invito</> };
    case 'persona.updated': return { ico: 'edit', node: <>Aggiornata l&apos;anagrafica di una persona</> };
    case 'azienda.created': return { ico: 'building', node: <>Nuova azienda in anagrafica</> };
    case 'azienda.updated': return { ico: 'building', node: <>Modificata un&apos;azienda</> };
    case 'azienda.unita': return { ico: 'building', node: <>Unite due aziende doppie</> };
    case 'incarico.created': return { ico: 'users', node: <>Assegnato un docente o tutor a un&apos;edizione</> };
    case 'incarico.removed': return { ico: 'x', node: <>Tolto un docente o tutor da un&apos;edizione</> };
    case 'sessione.created': return { ico: 'calendar', node: <>Pianificata la sessione {strong(titolo)}</> };
    case 'sessione.updated': return { ico: 'edit', node: <>Modificata la sessione {strong(titolo)}</> };
    case 'sessione.cancelled': return { ico: 'x', node: <>Annullata la sessione {strong(titolo)}</> };
    case 'report_grezzo_importato': return { ico: 'upload', node: <>Importato un report di partecipazione</> };
    case 'report_fondo_depositato': return { ico: 'report', node: <>Depositato un report per il fondo</> };
    case 'attestato.emesso': return { ico: 'shield', node: <>Emesso un attestato{p.automatico === true ? ' (automatico)' : ''}</> };
    case 'attestato.sostituito': return { ico: 'shield', node: <>Sostituito un attestato</> };
    default: return null;
  }
}

/**
 * Dashboard: cosa devo fare oggi. Solo conteggi e le edizioni in corso dalla
 * vista `edizione_riepilogo` (ondata C): niente più iscrizioni, attestati o
 * code caricati per intero.
 */
export default async function AdminDashboard() {
  const session = await requireAdmin();
  const supabase = createSupabaseServerClient();
  const now = new Date();
  const tra7 = new Date(now.getTime() + 7 * 86400000);

  const [corsiR, corsiAttiviR, edizioniAttiveR, edizioniTotR, personeR, codaR, prossime7R, sessioniR, eventiR] = await Promise.all([
    supabase.from('corso').select('id', { count: 'exact', head: true }).is('archiviato_at', null),
    supabase.from('corso_riepilogo').select('id', { count: 'exact', head: true }).eq('stato', 'attivo'),
    supabase.from('edizione_riepilogo').select('*, corso:corso_id ( id, titolo, archiviato_at )').eq('stato', 'attiva').order('data_inizio', { ascending: false, nullsFirst: false }).limit(EDIZIONI_IN_DASHBOARD).returns<EdizioneAttiva[]>(),
    supabase.from('edizione').select('id', { count: 'exact', head: true }).is('concluso_at', null).is('annullato_at', null),
    supabase.from('persona_riepilogo').select('id', { count: 'exact', head: true }).gt('n_iscrizioni', 0),
    supabase.from('coda_riconciliazione').select('id', { count: 'exact', head: true }).is('risolto_at', null),
    supabase.from('sessione').select('id', { count: 'exact', head: true }).is('annullato_at', null).gte('data_ora', now.toISOString()).lte('data_ora', tra7.toISOString()),
    supabase.from('sessione').select('id, titolo, data_ora, modalita, edizione:edizione_id ( id, codice, corso:corso_id ( id, titolo ) )').is('annullato_at', null).gte('data_ora', now.toISOString()).lte('data_ora', tra7.toISOString()).order('data_ora', { ascending: true }).limit(8).returns<SessioneProssima[]>(),
    supabase.from('evento').select('seq, event_type, occurred_at, payload').order('seq', { ascending: false }).limit(25),
  ]);

  const edizioniAttive = unwrap(edizioniAttiveR, 'le edizioni attive');
  const nEdizioniAttive = edizioniTotR.count ?? edizioniAttive.length;
  const prossime = unwrap(sessioniR, 'le sessioni');
  const nCoda = codaR.count ?? 0;
  const attivita = (unwrap(eventiR, 'le attività recenti') as EventoMini[])
    .map((ev) => ({ ev, view: activityView(ev) }))
    .filter((x) => x.view !== null)
    .slice(0, 8);

  const kpi: { label: string; value: number; icon: string; sub: string; href: Route }[] = [
    { label: 'Corsi attivi', value: corsiAttiviR.count ?? 0, icon: 'corsi', sub: `${corsiR.count ?? 0} nel catalogo`, href: '/admin/corsi?stato=attivo' as Route },
    { label: 'Edizioni in corso', value: nEdizioniAttive, icon: 'layers', sub: 'Aperte alla fruizione', href: '/admin/corsi?stato=attivo' as Route },
    { label: 'Iscritti', value: personeR.count ?? 0, icon: 'users', sub: 'Persone con almeno un’iscrizione', href: '/admin/persone' as Route },
    { label: 'Sessioni nei prossimi 7 giorni', value: prossime7R.count ?? prossime.length, icon: 'calendar', sub: prossime[0] ? `Prossima il ${fmtData(prossime[0].data_ora)}` : 'Nessuna in programma', href: '/admin/agenda' as Route },
  ];

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <h1>Buongiorno, {session.nome || 'amministratore'}</h1>
          <p>Le edizioni in corso, le sessioni della settimana e quello che aspetta una tua azione.</p>
        </div>
        <div className="page-head__actions">
          <Link className="btn" href="/admin/corsi/new"><Icon name="plus" /> Nuovo corso</Link>
        </div>
      </div>

      <nav className="kpi-strip" aria-label="Indicatori">
        {kpi.map((k) => (
          <Link key={k.label} href={k.href} className="kpi-strip__item">
            <span className="kpi-strip__label"><Icon name={k.icon} /> {k.label}</span>
            <span className="kpi-strip__value">{k.value}</span>
            <span className="kpi-strip__sub">{k.sub}</span>
          </Link>
        ))}
      </nav>

      {nCoda > 0 && (
        <div className="banner banner--ocra">
          <Icon name="alert" className="banner__icon" />
          <div className="banner__body">
            <strong>{nCoda} partecipant{nCoda === 1 ? 'e' : 'i'} da riconciliare</strong> nei report di partecipazione importati: aprili dalla colonna &quot;Da riconciliare&quot; qui sotto o dall&apos;<Link href="/admin/agenda">agenda</Link>.
          </div>
        </div>
      )}

      <div className="card">
        <div className="card__head">
          <div><h3>Edizioni in corso</h3><div className="sub">Ogni riga apre la pagina dell&apos;edizione: iscritti, sessioni, docenti, fondo, stato.{nEdizioniAttive > edizioniAttive.length && <> Mostro le {edizioniAttive.length} più recenti su {nEdizioniAttive}.</>}</div></div>
          <Link className="btn btn--secondary btn--sm" href="/admin/corsi?stato=attivo">Tutti i corsi attivi <Icon name="arrowRight" /></Link>
        </div>
        <div className="card__body card__body--flush">
          {edizioniAttive.length === 0 ? (
            <div className="card__body"><div className="muted">Nessuna edizione in corso. Crea un corso e la sua prima edizione.</div></div>
          ) : (
            <div className="tbl-wrap"><table className="tbl tbl--zebra">
              <thead><tr><th>Edizione</th><th>Corso</th><th>Date</th><th>Iscritti</th><th>Con piano</th><th>Sessioni</th><th>Da riconciliare</th><th>Attestati</th></tr></thead>
              <tbody>
                {edizioniAttive.map((e) => {
                  const href = `/admin/corsi/${e.corso?.id}/edizioni/${e.id}` as Route;
                  return (
                    <tr key={e.id}>
                      <td><Link className="t-link mono" href={href}>{e.codice}</Link></td>
                      <td>{e.corso ? <Link href={`/admin/corsi/${e.corso.id}`}>{e.corso.titolo}</Link> : '—'}</td>
                      <td className="muted">{e.data_inizio || e.data_fine ? `${fmtData(e.data_inizio)} → ${fmtData(e.data_fine)}` : '—'}</td>
                      <td>{e.n_iscritti === 0 ? <span className="chip chip--ocra">nessuno</span> : e.n_iscritti}</td>
                      <td className="muted">{e.n_con_piano > 0 ? `${e.n_con_piano}/${e.n_iscritti}` : '—'}</td>
                      <td className="muted">{e.n_sessioni}</td>
                      <td>{e.n_da_riconciliare > 0 ? <Link className="chip chip--ocra" href={`${href}/sessioni` as Route}>{e.n_da_riconciliare}</Link> : <span className="muted">—</span>}</td>
                      <td className="muted">{e.n_attestati}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </div>
      </div>

      <div className="grid-2-380">
        <div className="card">
          <div className="card__head">
            <h3>Prossimi 7 giorni</h3>
            <Link className="btn btn--ghost btn--sm" href="/admin/agenda">Agenda <Icon name="arrowRight" /></Link>
          </div>
          <div className="card__body">
            {prossime.length === 0 ? (
              <div className="muted">Nessuna sessione in programma questa settimana.</div>
            ) : (
              <div className="recent">
                {prossime.map((s) => (
                  <Link key={s.id} href={`/admin/corsi/${s.edizione?.corso?.id}/edizioni/${s.edizione?.id}/sessioni/${s.id}` as Route} className="recent__row">
                    <span className="activity__dot"><Icon name={s.modalita === 'vcs' ? 'video' : 'users'} /></span>
                    <div className="recent__main">
                      <div className="recent__title">{s.titolo}</div>
                      <div className="recent__meta">{fmtDataOra(s.data_ora)} · {s.edizione?.corso?.titolo ?? '—'} · <span className="mono">{s.edizione?.codice}</span></div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card__head"><h3>Attività recente</h3></div>
          <div className="card__body">
            {attivita.length === 0 ? (
              <div className="muted">Nessuna attività registrata.</div>
            ) : (
              <ul className="activity">
                {attivita.map(({ ev, view }) => (
                  <li key={ev.seq}>
                    <span className="activity__dot"><Icon name={view!.ico} /></span>
                    <div>
                      <div className="activity__txt">{view!.node}</div>
                      <div className="activity__time">{fmtTempoRelativo(ev.occurred_at)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
