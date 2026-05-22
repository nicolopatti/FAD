import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { LearningObjectRow } from '@/lib/db-types';
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
      <div style={{ marginBottom: 16 }}>
        <Link href="/admin/learning-objects" className="muted">
          ← Tutti i Learning Object
        </Link>
      </div>
      <h1>{lo.titolo}</h1>
      <div className="muted" style={{ marginBottom: 16 }}>
        <span className="badge muted">{lo.type}</span>
        {lo.archiviato_at && (
          <>
            {' · '}
            <span className="badge warn">archiviato {formatDate(lo.archiviato_at)}</span>
          </>
        )}
      </div>

      <ConfigSummary lo={lo} />
      <EditLearningObjectForm lo={lo} />
    </>
  );
}

function ConfigSummary({ lo }: { lo: LearningObjectRow }) {
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Contenuto</h3>
      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }} className="mono">
        {JSON.stringify(lo.config, null, 2)}
      </pre>
      <div className="muted" style={{ marginTop: 8, fontSize: '0.85em' }}>
        Per sostituire il contenuto: archivia questo Learning Object e creane uno nuovo
        (D24 — proprietà intrinseche; la sostituzione resta tracciabile nel log).
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
