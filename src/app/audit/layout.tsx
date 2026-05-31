import { requireAuditor } from '@/lib/auth-context';
import { AppShell } from '@/components/AppShell';

export default async function AuditLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuditor();
  return (
    <AppShell user={{ name: session.nome, email: session.email }} role="auditor" wide>
      {children}
    </AppShell>
  );
}
