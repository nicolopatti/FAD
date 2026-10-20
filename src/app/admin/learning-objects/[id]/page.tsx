import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import { corsoStato, LO_TYPE_LABEL, STATO_CORSO_CHIP, STATO_CORSO_LABEL, type LearningObjectRow, type QuizDomandaRow } from '@/lib/db-types';
import { configQuizDa } from '@/lib/quiz';
import { Crumb } from '@/components/AppShell';
import { Icon, fmtDataOra } from '@/components/admin/Atlante';
import { ContenutoForm } from './ContenutoForm';
import { ArchiviaPanel } from './EditLearningObjectForm';
import { QuizEditor } from './QuizEditor';

export const dynamic = 'force-dynamic';

type UsoRow = { corso_id: string; ordine: number; corso: { id: string; titolo: string; archiviato_at: string | null } | null };
type EdMini = { corso_id: string; concluso_at: string | null; annullato_at: string | null };

/** Pagina di un contenuto della libreria: dati reali, corsi che lo usano, archiviazione. */
export default async function EditLearningObjectPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data: lo } = await supabase
    .from('learning_object')
    .select('id, tenant_id, type, titolo, config, archiviato_at, creato_il')
    .eq('id', params.id)
    .maybeSingle<LearningObjectRow>();
  if (!lo) notFound();

  const usi = unwrap(await supabase.from('struttura_corso').select('corso_id, ordine, corso:corso_id ( id, titolo, archiviato_at )').eq('learning_object_id', lo.id).returns<UsoRow[]>(), 'i corsi che usano il contenuto');
  const corsiIds = Array.from(new Set(usi.map((u) => u.corso_id)));
  const edizioni = corsiIds.length ? unwrap(await supabase.from('edizione').select('corso_id, concluso_at, annullato_at').in('corso_id', corsiIds).returns<EdMini[]>(), 'le edizioni') : [];
  const corsi = corsiIds.map((id) => {
    const u = usi.find((x) => x.corso_id === id);
    return { id, titolo: u?.corso?.titolo ?? 'Corso', ordine: u?.ordine ?? 0, stato: corsoStato(edizioni.filter((e) => e.corso_id === id), u?.corso?.archiviato_at ?? null) };
  }).sort((a, b) => a.titolo.localeCompare(b.titolo, 'it'));
  // Per i test, il freeze D22 vale anche sulle domande.
  const congelato = corsi.some((c) => c.stato !== 'bozza');

  let domande: QuizDomandaRow[] = [];
  if (lo.type === 'quiz') {
    const { data } = await supabase.from('quiz_domanda').select('id, learning_object_id, ordine, testo, tipo, risposte').eq('learning_object_id', lo.id).order('ordine', { ascending: true }).returns<QuizDomandaRow[]>();
    domande = data ?? [];
  }
  const chipClass = lo.type === 'video' ? 'chip--teal' : lo.type === 'quiz' ? 'chip--accent' : 'chip--ocra';

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <Crumb items={[{ label: 'Corsi', href: '/admin/corsi' }, { label: 'Libreria dei contenuti', href: '/admin/learning-objects' }, { label: lo.titolo }]} />
          <h1>{lo.titolo}</h1>
          <div className="head-chips">
            <span className={`chip ${chipClass}`}>{LO_TYPE_LABEL[lo.type]}</span>
            <span>{corsi.length === 0 ? 'in nessun corso' : `lezione in ${corsi.length} cors${corsi.length === 1 ? 'o' : 'i'}`}</span>
            {lo.archiviato_at && <span className="chip chip--muted">archiviato · {fmtDataOra(lo.archiviato_at)}</span>}
          </div>
        </div>
        <div className="page-head__actions">
          <Link className="btn btn--ghost" href="/admin/learning-objects"><Icon name="arrowLeft" /> Libreria</Link>
        </div>
      </div>

      <div className="grid-2-380">
        <div>
          <ContenutoForm lo={lo} inCorsi={corsi.length} />
          {lo.type === 'quiz' && <QuizEditor loId={lo.id} config={configQuizDa(lo.config)} domandeIniziali={domande} congelato={congelato} />}
        </div>
        <div>
          <div className="card">
            <div className="card__head"><div><h3>Usato come lezione in</h3><div className="sub">Un contenuto corretto qui vale in tutti questi corsi.</div></div></div>
            <div className="card__body">
              {corsi.length === 0 ? (
                <div className="muted" style={{ fontSize: 13 }}>In nessun corso. Si aggiunge dalla scheda Lezioni di un corso, pannello &quot;Dalla libreria&quot;.</div>
              ) : (
                <ul className="ready">
                  {corsi.map((c) => (
                    <li key={c.id}>
                      <span className="ready__dot"><Icon name="corsi" /></span>
                      <span style={{ minWidth: 0 }}>
                        <Link href={`/admin/corsi/${c.id}/lezioni`}>{c.titolo}</Link>
                        <span className="muted"> · lezione {c.ordine}</span>
                        <span className={`chip ${STATO_CORSO_CHIP[c.stato]}`} style={{ marginLeft: 8 }}>{STATO_CORSO_LABEL[c.stato]}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <ArchiviaPanel lo={lo} inCorsi={corsi.length} />
        </div>
      </div>
    </>
  );
}
