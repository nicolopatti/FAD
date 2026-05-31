import { requireAdmin } from '@/lib/auth-context';
import { AppShell } from '@/components/AppShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  return (
    <AppShell user={{ name: session.nome, email: session.email }} role="admin" wide>
      {children}
    </AppShell>
  );
}
