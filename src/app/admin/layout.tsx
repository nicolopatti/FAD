import { requireAdmin } from '@/lib/auth-context';
import { TopBar } from '@/components/TopBar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  return (
    <>
      <TopBar email={session.email} isAuditor={session.isAuditor} isAdmin={session.isAdmin} />
      <main className="shell">{children}</main>
    </>
  );
}
