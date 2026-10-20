import { PageSkeleton } from '@/components/ui/PageStates';

export default function RootLoading() {
  return (
    <main className="state-page state-page--top">
      <PageSkeleton righe={3} />
    </main>
  );
}
