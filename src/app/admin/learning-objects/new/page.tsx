import Link from 'next/link';
import { requireAdmin } from '@/lib/auth-context';
import { Icon } from '@/components/admin/Atlante';
import { NewLearningObjectForm } from './NewLearningObjectForm';

export default async function NewLearningObjectPage() {
  const session = await requireAdmin();
  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <span className="eyebrow">Nuovo contenuto</span>
          <h1>Crea un contenuto</h1>
          <p>Un video Vimeo, un documento PDF o un test da usare come lezione nei corsi. Dal corso si aggiunge direttamente nella scheda Lezioni.</p>
        </div>
        <div className="page-head__actions">
          <Link className="btn btn--secondary" href="/admin/learning-objects"><Icon name="arrowLeft" /> Libreria</Link>
        </div>
      </div>
      <NewLearningObjectForm tenantId={session.tenantId} />
    </>
  );
}
