import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NewCorsoForm } from './NewCorsoForm';

export const dynamic = 'force-dynamic';

export default async function NewCorsoPage() {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.from('categoria').select('nome').order('ordine').order('nome');
  // L'H1 della pagina è nel form (page-head): qui non va duplicato.
  return <NewCorsoForm categorie={(data ?? []).map((c) => c.nome as string)} />;
}
