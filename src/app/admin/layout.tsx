import { requireAdmin } from '@/lib/auth-context';
import { AppShell } from '@/components/AppShell';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  const supabase = createSupabaseServerClient();

  // Conteggi per le voci di sidebar (head: solo count, niente righe).
  const [corsi, persone, agenda] = await Promise.all([
    supabase.from('corso').select('id', { count: 'exact', head: true }).is('archiviato_at', null),
    supabase.from('persona').select('id', { count: 'exact', head: true }),
    supabase.from('sessione').select('id', { count: 'exact', head: true }).is('annullato_at', null).gte('data_ora', new Date().toISOString()),
  ]);

  const counts: Record<string, number> = {
    corsi: corsi.count ?? 0,
    persone: persone.count ?? 0,
    agenda: agenda.count ?? 0,
  };

  return (
    <AppShell
      user={{ name: session.nome, email: session.email }}
      role="admin"
      wide
      counts={counts}
      scopeClassName="admin-scope"
    >
      {children}
    </AppShell>
  );
}
