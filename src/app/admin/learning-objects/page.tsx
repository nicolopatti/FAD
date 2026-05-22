import Link from 'next/link';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { LearningObjectRow } from '@/lib/db-types';

export const dynamic = 'force-dynamic';

export default async function LearningObjectsListPage() {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('learning_object')
    .select('id, tenant_id, type, titolo, config, archiviato_at, creato_il')
    .order('creato_il', { ascending: false })
    .returns<LearningObjectRow[]>();

  const lo = data ?? [];
  const attivi = lo.filter((x) => x.archiviato_at === null);
  const archiviati = lo.filter((x) => x.archiviato_at !== null);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Learning Object</h1>
        <Link className="btn" href="/admin/learning-objects/new">
          + Nuovo
        </Link>
      </div>

      {error && <div className="alert">Errore: {error.message}</div>}

      <h2 style={{ marginTop: 24 }}>Attivi ({attivi.length})</h2>
      {attivi.length === 0 ? (
        <div className="card muted">Nessun Learning Object attivo.</div>
      ) : (
        attivi.map((x) => <LoCard key={x.id} lo={x} />)
      )}

      {archiviati.length > 0 && (
        <>
          <h2 style={{ marginTop: 32 }}>Archiviati ({archiviati.length})</h2>
          {archiviati.map((x) => (
            <LoCard key={x.id} lo={x} archived />
          ))}
        </>
      )}
    </>
  );
}

function LoCard({ lo, archived = false }: { lo: LearningObjectRow; archived?: boolean }) {
  const summary = describeConfig(lo.type, lo.config);
  return (
    <Link
      href={`/admin/learning-objects/${lo.id}`}
      style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
    >
      <div className="card" style={{ opacity: archived ? 0.6 : 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3 style={{ margin: 0 }}>{lo.titolo}</h3>
          <span className="badge muted">{lo.type}</span>
        </div>
        <div className="muted" style={{ marginTop: 4 }}>
          {summary}
          {archived && (
            <>
              {' · '}
              <span className="badge warn">archiviato</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

function describeConfig(type: string, config: Record<string, unknown>): string {
  if (type === 'video') {
    const vid = config.vimeo_id;
    const d = config.durata_secondi;
    return `Vimeo ${typeof vid === 'string' ? vid : '?'} · ${typeof d === 'number' ? d : '?'} s`;
  }
  if (type === 'documento') {
    const name = config.filename;
    const size = config.size;
    const sizeKb = typeof size === 'number' ? Math.round(size / 1024) : '?';
    return `PDF ${typeof name === 'string' ? name : ''} · ${sizeKb} KB`;
  }
  return '';
}
