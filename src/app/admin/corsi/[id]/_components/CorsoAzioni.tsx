'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/admin/Atlante';
import { useFeedback } from '@/components/ui/Feedback';
import { useCall } from '@/components/admin/useCall';

/** Azioni della testata del corso: nuova edizione e duplica. */
export function CorsoAzioni({ corsoId }: { corsoId: string }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const { call, busy } = useCall();
  const [duplicando, setDuplicando] = useState(false);

  async function duplica() {
    const ok = await confirm({
      titolo: 'Duplicare questo corso?',
      messaggio: <>Viene creato un nuovo corso <strong>in bozza</strong> con gli stessi dati e la stessa sequenza di lezioni (che restano condivise nella libreria). Edizioni e iscritti non vengono copiati.</>,
      conferma: 'Duplica',
    });
    if (!ok) return;
    try {
      const res = (await call('POST', `/api/admin/corsi/${corsoId}/duplica`, undefined, { busy: setDuplicando })) as { corso: { id: string } };
      toast('Corso duplicato: sei nella copia, in bozza.');
      router.push(`/admin/corsi/${res.corso.id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'errore');
    }
  }

  return (
    <>
      <button type="button" className="btn btn--secondary" disabled={busy} onClick={duplica} title="Crea una copia in bozza di questo corso">
        <Icon name="copy" /> {duplicando ? 'Duplico…' : 'Duplica'}
      </button>
      <Link className="btn" href={`/admin/corsi/${corsoId}/edizioni?nuova=1`}>
        <Icon name="plus" /> Nuova edizione
      </Link>
    </>
  );
}
