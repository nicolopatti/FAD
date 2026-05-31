import { requireAdmin } from '@/lib/auth-context';
import { NewLearningObjectForm } from './NewLearningObjectForm';

export default async function NewLearningObjectPage() {
  const session = await requireAdmin();
  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <span className="eyebrow">Nuovo contenuto</span>
          <h1>Crea un contenuto</h1>
          <p>Aggiungi un oggetto didattico (video Vimeo o documento PDF) alla libreria del tenant.</p>
        </div>
        <div className="page-head__actions">
          <a className="btn btn--secondary" href="/admin/learning-objects">← Contenuti</a>
        </div>
      </div>
      <NewLearningObjectForm tenantId={session.tenantId} />
    </>
  );
}
