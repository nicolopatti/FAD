import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import type { CorsoRow, StrutturaCorsoConLO } from '@/lib/db-types';
import { Lezioni } from '../../_components/Lezioni';

export const dynamic = 'force-dynamic';

export default async function CorsoLezioniPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();

  const { data: corso } = await supabase
    .from('corso')
    .select('id, tenant_id, titolo, descrizione, sblocco_sequenziale, visione_integrale, categoria, cover_path, creato_il')
    .eq('id', params.id)
    .maybeSingle<CorsoRow>();
  if (!corso) notFound();

  const [struttura, edizioni] = await Promise.all([
    supabase
      .from('struttura_corso')
      .select('id, tenant_id, corso_id, learning_object_id, ordine, obbligatorio, regola_completamento, learning_object:learning_object_id ( titolo, type, config )')
      .eq('corso_id', corso.id)
      .order('ordine', { ascending: true })
      .returns<StrutturaCorsoConLO[]>()
      .then((r) => unwrap(r, 'le lezioni')),
    supabase.from('edizione').select('id', { count: 'exact', head: true }).eq('corso_id', corso.id),
  ]);
  const frozen = (edizioni.count ?? 0) > 0;

  return <Lezioni corso={corso} struttura={struttura} frozen={frozen} />;
}
