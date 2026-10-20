'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { StatoCorso } from '@/lib/db-types';
import { Icon } from '@/components/admin/Atlante';
import { useFeedback } from '@/components/ui/Feedback';
import { useCall } from '@/components/admin/useCall';

/** Azioni della testata del corso: archivia/ripristina, duplica, nuova edizione. */
export function CorsoAzioni({ corsoId, stato, nEdizioniAttive }: { corsoId: string; stato: StatoCorso; nEdizioniAttive: number }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const { call, busy } = useCall();
  const [duplicando, setDuplicando] = useState(false);
  const archiviato = stato === 'archiviato';

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

  async function archivia() {
    if (nEdizioniAttive > 0) {
      toast(`Il corso ha ${nEdizioniAttive} ${nEdizioniAttive === 1 ? 'edizione attiva' : 'edizioni attive'}: concludila prima dalla scheda Stato dell'edizione.`, 'errore');
      return;
    }
    const ok = await confirm({
      titolo: 'Archiviare questo corso?',
      messaggio: <>Sparisce dal catalogo, dalla dashboard e dai selettori. Edizioni concluse, attestati e registro restano com&apos;erano. Si ripristina in qualsiasi momento dal filtro &quot;Archiviati&quot; del catalogo.</>,
      conferma: 'Archivia',
    });
    if (!ok) return;
    try {
      const r = (await call('POST', '/api/admin/corsi/archivia', { corso_ids: [corsoId] })) as { fatti?: string[]; saltati?: { motivo: string }[] };
      if (r.fatti?.length) toast('Corso archiviato.'); else toast(r.saltati?.[0]?.motivo ?? 'Non archiviato.', 'errore');
    } catch { /* toast dal call */ }
  }

  async function ripristina() {
    try {
      const r = (await call('POST', '/api/admin/corsi/archivia', { corso_ids: [corsoId], ripristina: true })) as { fatti?: string[] };
      if (r.fatti?.length) toast('Corso ripristinato: è di nuovo nel catalogo.');
    } catch { /* toast dal call */ }
  }

  return (
    <>
      {archiviato ? (
        <button type="button" className="btn btn--secondary" disabled={busy} onClick={ripristina} title="Riporta il corso nel catalogo">
          <Icon name="archive" /> Ripristina
        </button>
      ) : (
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={archivia} title={nEdizioniAttive > 0 ? 'Prima concludi le edizioni attive' : 'Toglie il corso dal catalogo, senza cancellare nulla'}>
          <Icon name="archive" /> Archivia
        </button>
      )}
      <button type="button" className="btn btn--secondary" disabled={busy} onClick={duplica} title="Crea una copia in bozza di questo corso">
        <Icon name="copy" /> {duplicando ? 'Duplico…' : 'Duplica'}
      </button>
      {!archiviato && (
        <Link className="btn" href={`/admin/corsi/${corsoId}/edizioni?nuova=1`}>
          <Icon name="plus" /> Nuova edizione
        </Link>
      )}
    </>
  );
}
