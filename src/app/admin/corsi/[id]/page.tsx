import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CorsoRow, LearningObjectRow, StrutturaCorsoConLO } from '@/lib/db-types';
import { CorsoEditor } from './CorsoEditor';

export const dynamic = 'force-dynamic';

export default async function CorsoDetailPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data: corso } = await supabase
    .from('corso')
    .select('id, tenant_id, titolo, descrizione, sblocco_sequenziale, creato_il')
    .eq('id', params.id)
    .maybeSingle<CorsoRow>();
  if (!corso) notFound();

  const { data: struttura } = await supabase
    .from('struttura_corso')
    .select(`
      id, tenant_id, corso_id, learning_object_id, ordine, obbligatorio,
      regola_completamento,
      learning_object:learning_object_id ( titolo, type, config )
    `)
    .eq('corso_id', params.id)
    .order('ordine', { ascending: true })
    .returns<StrutturaCorsoConLO[]>();

  // LO disponibili per essere aggiunti: non archiviati e non già nella struttura.
  const usedLoIds = new Set((struttura ?? []).map((s) => s.learning_object_id));
  const { data: allLo } = await supabase
    .from('learning_object')
    .select('id, tenant_id, type, titolo, config, archiviato_at, creato_il')
    .is('archiviato_at', null)
    .order('titolo', { ascending: true })
    .returns<LearningObjectRow[]>();
  const availableLo = (allLo ?? []).filter((lo) => !usedLoIds.has(lo.id));

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Link href="/admin/corsi" className="muted">
          ← Tutti i corsi
        </Link>
      </div>
      <CorsoEditor
        corso={corso}
        struttura={struttura ?? []}
        availableLo={availableLo}
      />
    </>
  );
}
