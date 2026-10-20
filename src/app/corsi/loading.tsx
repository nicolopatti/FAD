import { PageSkeleton } from '@/components/ui/PageStates';

// Le pagine discente montano l'AppShell da sole: durante il caricamento si
// mostra lo scheletro del contenuto con una barra laterale segnaposto.
export default function CorsiLoading() {
  return (
    <div className="app">
      <aside className="sidebar sidebar--skeleton" aria-hidden="true">
        <div className="skeleton skeleton--brand" />
        <div className="skeleton skeleton--nav" />
      </aside>
      <main>
        <div className="content">
          <PageSkeleton righe={3} />
        </div>
      </main>
    </div>
  );
}
