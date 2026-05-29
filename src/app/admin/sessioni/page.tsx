import Link from 'next/link';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { EdizioneConCorso, SessioneConEdizione } from '@/lib/db-types';
import { NewSessioneForm } from './NewSessioneForm';

export const dynamic = 'force-dynamic';

function fmtData(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
}

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

  return (
    <>
      <h1>Sessioni (webinar / aula)</h1>
      <div className="muted" style={{ marginBottom: 16, fontSize: '0.9em' }}>
        Eventi sincroni datati dentro un&apos;Edizione (D30). Per le sessioni VCS si
        importa il report di partecipazione (CSV ora; API Teams in seguito) che la
        pipeline trasforma in Eventi di presenza.
      </div>

      {error && <div className="alert">Errore: {error.message}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Sessioni pianificate ({sessioni?.length ?? 0})</h3>
        {!sessioni || sessioni.length === 0 ? (
          <div className="muted">Nessuna sessione ancora pianificata.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Titolo</th>
                <th>Corso / Edizione</th>
                <th>Quando</th>
                <th>Modalità</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {sessioni.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.titolo}
                    {s.annullato_at && <span className="badge bad" style={{ marginLeft: 6 }}>annullata</span>}
                  </td>
                  <td className="muted">
                    {s.edizione?.corso?.titolo ?? '—'}
                    {s.edizione?.codice && <span className="mono"> · {s.edizione.codice}</span>}
                  </td>
                  <td className="muted">
                    {fmtData(s.data_ora)}
                    {s.durata_minuti != null && ` · ${s.durata_minuti}′`}
                  </td>
                  <td>
                    {s.modalita === 'vcs' ? (
                      <span className="badge muted">VCS · {s.vcs_piattaforma ?? '?'}</span>
                    ) : (
                      <span className="badge muted">aula</span>
                    )}
                  </td>
                  <td>
                    <Link href={`/admin/sessioni/${s.id}`}>Apri →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <NewSessioneForm edizioni={edizioni ?? []} />
    </>
  );
}
