import Link from 'next/link';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CorsoRow } from '@/lib/db-types';

export const dynamic = 'force-dynamic';

type CorsoConCount = CorsoRow & { struttura_count: number };

export default async function CorsiListPage() {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data: corsi, error } = await supabase
    .from('corso')
    .select('id, tenant_id, titolo, descrizione, sblocco_sequenziale, creato_il')
    .order('creato_il', { ascending: false })
    .returns<CorsoRow[]>();

  // Conta gli LO della Struttura per ogni corso (lo facciamo qui invece di un
  // count(*) nel select perché PostgREST richiederebbe una vista o un trick).
  const corsoIds = (corsi ?? []).map((c) => c.id);
  let counts: Record<string, number> = {};
  if (corsoIds.length) {
    const { data: rows } = await supabase
      .from('struttura_corso')
      .select('corso_id')
      .in('corso_id', corsoIds);
    counts = (rows ?? []).reduce<Record<string, number>>((acc, r) => {
      const id = (r as { corso_id: string }).corso_id;
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});
  }

  const enriched: CorsoConCount[] = (corsi ?? []).map((c) => ({
    ...c,
    struttura_count: counts[c.id] ?? 0,
  }));

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Corsi</h1>
        <Link className="btn" href="/admin/corsi/new">
          + Nuovo
        </Link>
      </div>

      {error && <div className="alert">Errore: {error.message}</div>}

      {enriched.length === 0 ? (
        <div className="card muted">Nessun corso ancora creato.</div>
      ) : (
        enriched.map((c) => (
          <Link
            key={c.id}
            href={`/admin/corsi/${c.id}`}
            style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
          >
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h3 style={{ margin: 0 }}>{c.titolo}</h3>
                <span className="muted">
                  {c.struttura_count} LO
                  {c.sblocco_sequenziale && ' · sblocco sequenziale'}
                </span>
              </div>
              {c.descrizione && (
                <div className="muted" style={{ marginTop: 4 }}>{c.descrizione}</div>
              )}
            </div>
          </Link>
        ))
      )}
    </>
  );
}
