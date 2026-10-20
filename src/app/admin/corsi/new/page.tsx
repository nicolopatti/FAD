import { requireAdmin } from '@/lib/auth-context';
import { NewCorsoForm } from './NewCorsoForm';

export default async function NewCorsoPage() {
  await requireAdmin();
  // L'H1 della pagina è nel form (page-head): qui non va duplicato.
  return <NewCorsoForm />;
}
