import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { LearningObjectRow } from '@/lib/db-types';
import { Icon, fmtDataOra } from '@/components/admin/Atlante';
import { EditLearningObjectForm } from './EditLearningObjectForm';

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

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <span className="eyebrow">Contenuto</span>
          <h1>{lo.titolo}</h1>
          <div className="row row--wrap" style={{ marginTop: 8 }}>
            <span className={`chip ${lo.type === 'video' ? 'chip--teal' : 'chip--ocra'}`}>{lo.type === 'video' ? 'Video' : 'PDF'}</span>
            {lo.archiviato_at && <span className="chip chip--muted">archiviato · {fmtDataOra(lo.archiviato_at)}</span>}
          </div>
        </div>
        <div className="page-head__actions">
          <a className="btn btn--secondary" href="/admin/learning-objects"><Icon name="arrowLeft" /> Contenuti</a>
        </div>
      </div>

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

      <EditLearningObjectForm lo={lo} />
    </>
  );
}
