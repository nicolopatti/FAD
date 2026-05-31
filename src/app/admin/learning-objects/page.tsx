import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { LearningObjectRow } from '@/lib/db-types';
import { ContenutiTable, type ContenutoRow } from './ContenutiTable';

export const dynamic = 'force-dynamic';

export default async function LearningObjectsListPage() {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const [loR, strutturaR] = await Promise.all([
    supabase
      .from('learning_object')
      .select('id, tenant_id, type, titolo, config, archiviato_at, creato_il')
      .order('creato_il', { ascending: false })
      .returns<LearningObjectRow[]>(),
    supabase.from('struttura_corso').select('learning_object_id'),
  ]);

  const usage = new Map<string, number>();
  for (const s of strutturaR.data ?? []) {
    const id = s.learning_object_id as string;
    usage.set(id, (usage.get(id) ?? 0) + 1);
  }

  const rows: ContenutoRow[] = (loR.data ?? []).map((lo) => ({
    id: lo.id,
    type: lo.type,
    titolo: lo.titolo,
    config: lo.config,
    archiviato: lo.archiviato_at !== null,
    creato_il: lo.creato_il,
    usato_in: usage.get(lo.id) ?? 0,
  }));

  return <ContenutiTable rows={rows} />;
}
