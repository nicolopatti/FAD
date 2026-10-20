import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CorsoRow } from '@/lib/db-types';
import { FormImpostazioni } from '../../_components/FormImpostazioni';

export const dynamic = 'force-dynamic';

export default async function CorsoImpostazioniPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { data: corso } = await supabase
    .from('corso')
    .select('id, tenant_id, titolo, descrizione, sblocco_sequenziale, visione_integrale, categoria, cover_path, creato_il')
    .eq('id', params.id)
    .maybeSingle<CorsoRow>();
  if (!corso) notFound();
  const { count } = await supabase.from('edizione').select('id', { count: 'exact', head: true }).eq('corso_id', corso.id);
  const n = count ?? 0;
  return <FormImpostazioni corso={corso} frozen={n > 0} nEdizioni={n} />;
}
