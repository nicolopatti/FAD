import { NotFoundState } from '@/components/ui/PageStates';

export default function AdminNotFound() {
  return (
    <NotFoundState
      messaggio="Il corso, il contenuto o la sessione richiesti non esistono più o non appartengono a questo tenant."
      homeHref="/admin"
      homeLabel="Dashboard"
    />
  );
}
