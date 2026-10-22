import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { hostRichiesta } from '@/lib/vetrina';

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // Fase 6 (§10.8): sugli indirizzi collegati a un ente il visitatore vede il catalogo.
    const { data: tenant } = await supabase.rpc('tenant_da_host', { p_host: await hostRichiesta() });
    redirect(tenant ? '/catalogo' : '/login');
  }
  const role = (user.app_metadata as { role?: string })?.role;
  if (role === 'auditor') redirect('/audit/log');
  if (role === 'admin') redirect('/admin');
  redirect('/corsi');
}
