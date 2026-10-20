import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import type { EdizioneConCorso, SessioneConEdizione } from '@/lib/db-types';
import { NewSessioneForm } from './NewSessioneForm';
import { SessioniTable, type Quando } from './SessioniTable';

export const dynamic = 'force-dynamic';

export default async function SessioniListPage({ searchParams }: { searchParams?: { quando?: string } }) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const quando: Quando =
    searchParams?.quando === 'prossime' || searchParams?.quando === 'passate' || searchParams?.quando === 'annullate'
      ? searchParams.quando
      : 'tutte';

  const [sessioniR, edizioniR] = await Promise.all([
    supabase
      .from('sessione')
      .select(`
        id, titolo, data_ora, durata_minuti, modalita, vcs_piattaforma, vcs_meeting_id,
        annullato_at, creato_il,
        edizione:edizione_id ( id, codice, corso:corso_id ( id, titolo ) )
      `)
      .order('creato_il', { ascending: false })
      .returns<SessioneConEdizione[]>(),
    supabase
      .from('edizione')
      .select('id, codice, concluso_at, annullato_at, corso:corso_id ( id, titolo )')
      .is('concluso_at', null)
      .is('annullato_at', null)
      .order('creato_il', { ascending: false })
      .returns<EdizioneConCorso[]>(),
  ]);

  const sessioni = unwrap(sessioniR, 'le sessioni');
  const edizioni = unwrap(edizioniR, 'le edizioni');

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <span className="eyebrow">Sessioni</span>
          <h1>Webinar e aula</h1>
          <p>
            Incontri sincroni, in videoconferenza o in aula, dentro un&apos;edizione. Per i webinar si
            importa il report di partecipazione (CSV) e la piattaforma lo trasforma in presenze registrate.
          </p>
        </div>
      </div>

      <SessioniTable sessioni={sessioni} quandoIniziale={quando} />

      <NewSessioneForm edizioni={edizioni} />
    </>
  );
}
