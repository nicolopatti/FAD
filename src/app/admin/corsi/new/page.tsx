import { requireAdmin } from '@/lib/auth-context';
import { NewCorsoForm } from './NewCorsoForm';

export default async function NewCorsoPage() {
  await requireAdmin();
  return (
    <>
      <h1>Nuovo Corso</h1>
      <NewCorsoForm />
    </>
  );
}
