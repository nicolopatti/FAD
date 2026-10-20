'use client';

import type { LearningObjectRow } from '@/lib/db-types';
import { Icon } from '@/components/admin/Atlante';
import { useFeedback } from '@/components/ui/Feedback';
import { useCall } from '@/components/admin/useCall';
import { ErrorBanner } from '@/components/admin/ErrorBanner';

/** Archivia o ripristina un contenuto della libreria (mai cancellazione fisica). */
export function ArchiviaPanel({ lo, inCorsi }: { lo: LearningObjectRow; inCorsi: number }) {
  const { confirm } = useFeedback();
  const { call, busy, error } = useCall();
  const archived = lo.archiviato_at !== null;

  async function archiveOrUnarchive() {
    if (!archived) {
      const ok = await confirm({
        titolo: `Archiviare "${lo.titolo}"?`,
        messaggio: inCorsi > 0
          ? `Sparisce dalla libreria e non si potrà aggiungere a nuovi corsi. I ${inCorsi} ${inCorsi === 1 ? 'corso che lo usa continua' : 'corsi che lo usano continuano'} a funzionare. Si può ripristinare in qualsiasi momento.`
          : 'Sparisce dalla libreria e non si potrà aggiungere a nuovi corsi. Si può ripristinare in qualsiasi momento.',
        conferma: 'Archivia',
      });
      if (!ok) return;
    }
    try {
      await call('POST', `/api/admin/learning-objects/${lo.id}/${archived ? 'unarchive' : 'archive'}`, undefined, { successo: archived ? 'Contenuto ripristinato.' : 'Contenuto archiviato.' });
    } catch { /* banner */ }
  }

  return (
    <div className="card">
      <div className="card__head"><h3>{archived ? 'Archiviato' : 'Archiviazione'}</h3></div>
      <div className="card__body">
        <ErrorBanner error={error} />
        <p className="muted" style={{ marginBottom: 12, fontSize: 13 }}>
          {archived
            ? 'Il contenuto non compare nella libreria attiva. Ripristinalo per poterlo aggiungere di nuovo ai corsi.'
            : 'Un contenuto archiviato resta consultabile e continua a funzionare nei corsi che lo usano; non si può più aggiungere a corsi nuovi.'}
        </p>
        <button type="button" className={`btn ${archived ? '' : 'btn--secondary'}`} onClick={archiveOrUnarchive} disabled={busy}>
          <Icon name="archive" /> {archived ? 'Ripristina' : 'Archivia'}
        </button>
      </div>
    </div>
  );
}
