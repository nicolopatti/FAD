import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { LO_TYPE_LABEL, type LearningObjectRow, type QuizDomandaRow } from '@/lib/db-types';
import { configQuizDa } from '@/lib/quiz';
import { Icon, fmtDataOra } from '@/components/admin/Atlante';
import { EditLearningObjectForm } from './EditLearningObjectForm';
import { QuizEditor } from './QuizEditor';

export const dynamic = 'force-dynamic';

export default async function EditLearningObjectPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data: lo } = await supabase
    .from('learning_object')
    .select('id, tenant_id, type, titolo, config, archiviato_at, creato_il')
    .eq('id', params.id)
    .maybeSingle<LearningObjectRow>();

  if (!lo) notFound();

  // Usato in corsi con edizioni? (freeze D22: per i test blocca anche le domande)
  const { data: usi } = await supabase.from('struttura_corso').select('corso_id, corso:corso_id ( titolo )').eq('learning_object_id', lo.id).returns<{ corso_id: string; corso: { titolo: string } | null }[]>();
  const corsiIds = Array.from(new Set((usi ?? []).map((u) => u.corso_id)));
  let congelato = false;
  if (corsiIds.length) {
    const { count } = await supabase.from('edizione').select('id', { count: 'exact', head: true }).in('corso_id', corsiIds);
    congelato = (count ?? 0) > 0;
  }

  let domande: QuizDomandaRow[] = [];
  if (lo.type === 'quiz') {
    const { data } = await supabase
      .from('quiz_domanda')
      .select('id, learning_object_id, ordine, testo, tipo, risposte')
      .eq('learning_object_id', lo.id)
      .order('ordine', { ascending: true })
      .returns<QuizDomandaRow[]>();
    domande = data ?? [];
  }

  const chipClass = lo.type === 'video' ? 'chip--teal' : lo.type === 'quiz' ? 'chip--accent' : 'chip--ocra';

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <span className="eyebrow">Contenuto</span>
          <h1>{lo.titolo}</h1>
          <div className="row row--wrap" style={{ marginTop: 8 }}>
            <span className={`chip ${chipClass}`}>{LO_TYPE_LABEL[lo.type]}</span>
            {usi && usi.length > 0 && <span className="chip chip--muted">usato in {usi.length} cors{usi.length === 1 ? 'o' : 'i'}</span>}
            {congelato && <span className="chip chip--freeze"><span className="dot" />congelato</span>}
            {lo.archiviato_at && <span className="chip chip--muted">archiviato · {fmtDataOra(lo.archiviato_at)}</span>}
          </div>
        </div>
        <div className="page-head__actions">
          <Link className="btn btn--ghost" href="/admin/learning-objects"><Icon name="arrowLeft" /> Contenuti</Link>
        </div>
      </div>

      {lo.type === 'quiz' ? (
        <QuizEditor loId={lo.id} config={configQuizDa(lo.config)} domandeIniziali={domande} congelato={congelato} />
      ) : (
        <div className="card">
          <div className="card__head"><h3>Contenuto</h3></div>
          <div className="card__body">
            <pre className="mono" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, fontSize: 12 }}>
              {JSON.stringify(lo.config, null, 2)}
            </pre>
            <div className="field__hint" style={{ marginTop: 10 }}>
              Per sostituire il contenuto: archivia questo oggetto e creane uno nuovo (le proprietà
              sono intrinseche; la sostituzione resta tracciabile nel log).
            </div>
          </div>
        </div>
      )}

      <EditLearningObjectForm lo={lo} />
    </>
  );
}
