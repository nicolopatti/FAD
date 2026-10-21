import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CorsoRow } from '@/lib/db-types';
import { FormImpostazioni } from '../../_components/FormImpostazioni';

export const dynamic = 'force-dynamic';

export default async function CorsoImpostazioniPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: corso } = await supabase
    .from('corso')
    .select('id, tenant_id, titolo, descrizione, sblocco_sequenziale, visione_integrale, categoria, cover_path, soglia_frequenza_percentuale, creato_il')
    .eq('id', params.id)
    .maybeSingle<CorsoRow>();
  if (!corso) notFound();
  const [{ count }, categorieR] = await Promise.all([
    supabase.from('edizione').select('id', { count: 'exact', head: true }).eq('corso_id', corso.id),
    supabase.from('categoria').select('nome').order('ordine').order('nome'),
  ]);
  const n = count ?? 0;
  const categorie = (categorieR.data ?? []).map((c) => c.nome as string);
  return <FormImpostazioni corso={corso} frozen={n > 0} nEdizioni={n} categorie={categorie} />;
}
