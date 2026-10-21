import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import type { SessioneConEdizione } from '@/lib/db-types';
import { AgendaList, type Quando, type SessioneAgenda } from './AgendaList';

export const dynamic = 'force-dynamic';

/**
 * Agenda: tutte le sessioni di tutte le edizioni, in sola lettura, con il
 * collegamento all'edizione. Si pianifica dall'edizione, non da qui.
 */
export default async function AgendaPage(props: { searchParams?: Promise<{ quando?: string }> }) {
  const searchParams = await props.searchParams;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const quando: Quando = searchParams?.quando === 'passate' || searchParams?.quando === 'tutte' ? searchParams.quando : 'prossime';

  const sessioni = unwrap(await supabase
    .from('sessione')
    .select('id, titolo, data_ora, durata_minuti, modalita, vcs_piattaforma, vcs_meeting_id, incarico_id, annullato_at, creato_il, edizione:edizione_id ( id, codice, corso:corso_id ( id, titolo ) )')
    .order('data_ora', { ascending: true, nullsFirst: false })
    .limit(1000)
    .returns<SessioneConEdizione[]>(), 'le sessioni');
  const ids = sessioni.map((s) => s.id);
  const incaricoIds = Array.from(new Set(sessioni.map((s) => s.incarico_id).filter((x): x is string => Boolean(x))));
  const [coda, docenti] = await Promise.all([
    ids.length ? supabase.from('coda_riconciliazione').select('sessione_id').in('sessione_id', ids).is('risolto_at', null).then((r) => unwrap(r, 'la coda')) : Promise.resolve([] as { sessione_id: string }[]),
    incaricoIds.length ? supabase.from('incarico').select('id, persona:persona_id ( nome, cognome )').in('id', incaricoIds).returns<{ id: string; persona: { nome: string; cognome: string } | null }[]>().then((r) => unwrap(r, 'i docenti')) : Promise.resolve([] as { id: string; persona: { nome: string; cognome: string } | null }[]),
  ]);
  const codaPer = new Map<string, number>();
  for (const c of coda) codaPer.set(c.sessione_id as string, (codaPer.get(c.sessione_id as string) ?? 0) + 1);
  const docenteDi = new Map(docenti.map((d) => [d.id, d.persona ? `${d.persona.cognome} ${d.persona.nome}` : null]));

  const righe: SessioneAgenda[] = sessioni.map((s) => ({
    id: s.id,
    titolo: s.titolo,
    data_ora: s.data_ora,
    durata_minuti: s.durata_minuti,
    modalita: s.modalita,
    piattaforma: s.vcs_piattaforma,
    annullata: Boolean(s.annullato_at),
    corso: s.edizione?.corso?.titolo ?? '—',
    corso_id: s.edizione?.corso?.id ?? null,
    edizione: s.edizione?.codice ?? '—',
    edizione_id: s.edizione?.id ?? null,
    docente: s.incarico_id ? docenteDi.get(s.incarico_id) ?? null : null,
    coda: codaPer.get(s.id) ?? 0,
  }));

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <h1>Agenda</h1>
          <p>Webinar e incontri in aula di tutte le edizioni. Le sessioni si pianificano e si gestiscono dalla loro edizione: da qui si vede quando succede cosa.</p>
        </div>
      </div>
      <AgendaList righe={righe} quando={quando} />
    </>
  );
}
