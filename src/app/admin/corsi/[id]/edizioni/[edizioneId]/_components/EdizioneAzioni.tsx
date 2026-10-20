'use client';

import { edizioneStato, type EdizioneRow } from '@/lib/db-types';
import { useFeedback } from '@/components/ui/Feedback';
import { useCall } from '@/components/admin/useCall';
import { ErrorBanner } from '@/components/admin/ErrorBanner';

/** Concludi / annulla l'edizione (scheda Stato). */
export function EdizioneAzioni({ edizione }: { edizione: EdizioneRow }) {
  const { confirm } = useFeedback();
  const { call, busy, error } = useCall();
  const stato = edizioneStato(edizione);

  async function concludi() {
    if (!(await confirm({ titolo: `Concludere l'edizione ${edizione.codice}?`, messaggio: 'Gli iscritti non potranno più fruire delle lezioni. Lo stato finale di ciascuno resta registrato e gli attestati già emessi restano validi.', conferma: 'Concludi' }))) return;
    try { await call('POST', `/api/admin/edizioni/${edizione.id}/concludi`, undefined, { successo: `Edizione ${edizione.codice} conclusa.` }); } catch { /* banner */ }
  }
  async function annulla() {
    if (!(await confirm({ titolo: `Annullare l'edizione ${edizione.codice}?`, messaggio: 'L\'edizione resta nel registro come annullata e non sarà più fruibile. L\'operazione non si può annullare.', conferma: 'Annulla edizione', pericolosa: true }))) return;
    try { await call('POST', `/api/admin/edizioni/${edizione.id}/annulla`, undefined, { successo: `Edizione ${edizione.codice} annullata.` }); } catch { /* banner */ }
  }

  return (
    <div className="card">
      <div className="card__head"><div><h3>Chiusura</h3><div className="sub">{stato === 'attiva' ? 'Quando l\'erogazione è finita, concludi l\'edizione: resta consultabile e rendicontabile.' : `Edizione ${stato}.`}</div></div></div>
      <div className="card__body">
        <ErrorBanner error={error} />
        <div className="row">
          <button type="button" className="btn btn--secondary" disabled={busy || stato !== 'attiva'} onClick={concludi}>Concludi edizione</button>
          <button type="button" className="btn btn--danger" disabled={busy || stato === 'annullata'} onClick={annulla}>Annulla edizione</button>
        </div>
      </div>
    </div>
  );
}
