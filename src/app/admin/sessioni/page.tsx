import Link from 'next/link';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { EdizioneConCorso, SessioneConEdizione } from '@/lib/db-types';
import { Icon, fmtDataOra } from '@/components/admin/Atlante';
import { NewSessioneForm } from './NewSessioneForm';

export const dynamic = 'force-dynamic';

export default async function SessioniListPage() {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data: sessioni, error } = await supabase
    .from('sessione')
    .select(`
      id, titolo, data_ora, durata_minuti, modalita, vcs_piattaforma, vcs_meeting_id,
      annullato_at, creato_il,
      edizione:edizione_id ( id, codice, corso:corso_id ( id, titolo ) )
    `)
    .order('creato_il', { ascending: false })
    .returns<SessioneConEdizione[]>();

  const { data: edizioni } = await supabase
    .from('edizione')
    .select('id, codice, corso:corso_id ( id, titolo )')
    .order('creato_il', { ascending: false })
    .returns<EdizioneConCorso[]>();

  const lista = sessioni ?? [];

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <span className="eyebrow">Sessioni</span>
          <h1>Webinar e aula</h1>
          <p>
            Eventi sincroni datati dentro un&apos;edizione. Per le sessioni in videoconferenza si
            importa il report di partecipazione (CSV ora, API in seguito) che la pipeline trasforma
            in eventi di presenza.
          </p>
        </div>
      </div>

      {error && (
        <div className="banner banner--err"><Icon name="alert" className="banner__icon" /><div className="banner__body">{error.message}</div></div>
      )}

      <div className="card">
        <div className="card__head">
          <h3>Sessioni pianificate</h3>
          <span className="chip chip--muted">{lista.length} {lista.length === 1 ? 'sessione' : 'sessioni'}</span>
        </div>
        <div className="card__body card__body--flush">
          {lista.length === 0 ? (
            <div className="card__body">
              <div className="muted">Nessuna sessione ancora pianificata.</div>
            </div>
          ) : (
            <table className="tbl tbl--zebra">
              <thead>
                <tr>
                  <th>Titolo</th>
                  <th>Corso / Edizione</th>
                  <th>Quando</th>
                  <th style={{ width: 150 }}>Modalità</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="t-title">{s.titolo}</span>
                      {s.annullato_at && <span className="chip chip--err" style={{ marginLeft: 8 }}>annullata</span>}
                    </td>
                    <td className="muted">
                      {s.edizione?.corso?.titolo ?? '—'}
                      {s.edizione?.codice && <span className="mono"> · {s.edizione.codice}</span>}
                    </td>
                    <td className="muted">
                      {fmtDataOra(s.data_ora)}
                      {s.durata_minuti != null && ` · ${s.durata_minuti}′`}
                    </td>
                    <td>
                      {s.modalita === 'vcs'
                        ? <span className="chip chip--teal">Webinar · {s.vcs_piattaforma ?? '?'}</span>
                        : <span className="chip chip--ocra">Aula</span>}
                    </td>
                    <td>
                      <Link className="linklike" href={`/admin/sessioni/${s.id}`}>Apri →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <NewSessioneForm edizioni={edizioni ?? []} />
    </>
  );
}
