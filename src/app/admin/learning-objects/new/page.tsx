import { requireAdmin } from '@/lib/auth-context';
import { NewLearningObjectForm } from './NewLearningObjectForm';

export default async function NewLearningObjectPage() {
  const session = await requireAdmin();
  return (
    <>
      <h1>Nuovo Learning Object</h1>
      <NewLearningObjectForm tenantId={session.tenantId} />
    </>
  );
}
