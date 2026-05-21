import { requireAuditor } from '@/lib/auth-context';
import { TopBar } from '@/components/TopBar';

export default async function AuditLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuditor();
  return (
    <>
      <TopBar email={session.email} isAuditor={session.isAuditor} />
      <main className="shell">{children}</main>
    </>
  );
}
