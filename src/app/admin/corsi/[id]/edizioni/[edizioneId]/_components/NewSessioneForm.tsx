'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { INCARICO_RUOLO_LABEL, type IncaricoConPersona, type SessioneModalita, type VcsPiattaforma } from '@/lib/db-types';
import { Icon } from '@/components/admin/Atlante';
import { Field } from '@/components/admin/Form';
import { useFeedback } from '@/components/ui/Feedback';
import { useCall } from '@/components/admin/useCall';
import { ErrorBanner } from '@/components/admin/ErrorBanner';
import type { Errori } from '@/lib/validazione';

/** Pianifica una sessione (webinar o aula) dentro l'edizione; il docente si sceglie tra gli incarichi didattici. */
export function NewSessioneForm({ corsoId, edizioneId, docenti, onChiudi }: { corsoId: string; edizioneId: string; docenti: IncaricoConPersona[]; onChiudi?: () => void }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const { call, busy, error } = useCall();
  const [titolo, setTitolo] = useState('');
  const [modalita, setModalita] = useState<SessioneModalita>('vcs');
  const [piattaforma, setPiattaforma] = useState<VcsPiattaforma>('teams');
  const [meetingId, setMeetingId] = useState('');
  const [dataOra, setDataOra] = useState('');
  const [durata, setDurata] = useState('');
  const [incaricoId, setIncaricoId] = useState('');
  const [creando, setCreando] = useState(false);
  const [errs, setErrs] = useState<Errori>({});

  function valida(): Errori {
    const e: Errori = {};
    if (!titolo.trim()) e.titolo = 'Indica un titolo, es. "Webinar modulo 1".';
    if (durata.trim() && (!/^\d+$/.test(durata.trim()) || Number(durata) <= 0)) e.durata = 'Minuti interi, es. 90.';
    if (dataOra && Number.isNaN(new Date(dataOra).getTime())) e.dataOra = 'Data o ora non valide.';
    return e;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ve = valida();
    setErrs(ve);
    if (Object.keys(ve).length) return;
    try {
      const res = (await call('POST', '/api/admin/sessioni', {
        edizione_id: edizioneId,
        titolo: titolo.trim(),
        modalita,
        vcs_piattaforma: modalita === 'vcs' ? piattaforma : null,
        vcs_meeting_id: modalita === 'vcs' ? meetingId.trim() || null : null,
        data_ora: dataOra ? new Date(dataOra).toISOString() : null,
        durata_minuti: durata.trim() ? Number(durata) : null,
      }, { busy: setCreando })) as { sessione: { id: string } };
      if (incaricoId) {
        await call('PATCH', `/api/admin/sessioni/${res.sessione.id}`, { incarico_id: incaricoId });
      }
      toast(`Sessione "${titolo.trim()}" pianificata.`);
      router.push(`/admin/corsi/${corsoId}/edizioni/${edizioneId}/sessioni/${res.sessione.id}`);
    } catch { /* banner */ }
  }

  const clear = (k: string) => { if (errs[k]) setErrs({ ...errs, [k]: '' }); };

  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head">
        <div><h3>Pianifica una sessione</h3><div className="sub">Un incontro sincrono dell&apos;edizione. Per i webinar, dopo l&apos;incontro si importa il report di partecipazione e la piattaforma lo trasforma in presenze.</div></div>
        {onChiudi && <button type="button" className="btn btn--ghost btn--sm" onClick={onChiudi}>Chiudi</button>}
      </div>
      <div className="card__body">
        <ErrorBanner error={error} />
        <div className="grid-2">
          <Field id="ns-titolo" label="Titolo" required error={errs.titolo}>
            <input id="ns-titolo" className="input" value={titolo} onChange={(e) => { setTitolo(e.target.value); clear('titolo'); }} disabled={busy} placeholder="es. Webinar Modulo 1" aria-invalid={Boolean(errs.titolo)} autoFocus />
          </Field>
          <Field id="ns-docente" label="Docente" hint={docenti.length === 0 ? 'Nessun docente o tutor nell’edizione: si assegna nella scheda "Docenti e tutor". Facoltativo.' : 'Facoltativo, si può cambiare dopo.'}>
            <select id="ns-docente" className="select" value={incaricoId} onChange={(e) => setIncaricoId(e.target.value)} disabled={busy || docenti.length === 0}>
              <option value="">— nessuno —</option>
              {docenti.map((d) => <option key={d.id} value={d.id}>{d.persona ? `${d.persona.cognome} ${d.persona.nome}` : d.persona_id} · {INCARICO_RUOLO_LABEL[d.ruolo]}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid-2">
          <Field id="ns-modalita" label="Modalità">
            <select id="ns-modalita" className="select" value={modalita} onChange={(e) => setModalita(e.target.value as SessioneModalita)} disabled={busy}>
              <option value="vcs">Webinar (videoconferenza)</option>
              <option value="aula">Aula</option>
            </select>
          </Field>
          {modalita === 'vcs' && (
            <Field id="ns-piattaforma" label="Piattaforma">
              <select id="ns-piattaforma" className="select" value={piattaforma} onChange={(e) => setPiattaforma(e.target.value as VcsPiattaforma)} disabled={busy}>
                <option value="teams">Microsoft Teams</option>
                <option value="zoom">Zoom</option>
              </select>
            </Field>
          )}
        </div>
        {modalita === 'vcs' && (
          <Field id="ns-meeting" label="ID riunione" hint="Facoltativo: servirà all'import automatico delle presenze.">
            <input id="ns-meeting" className="input" value={meetingId} onChange={(e) => setMeetingId(e.target.value)} disabled={busy} placeholder="es. ID della riunione Teams" />
          </Field>
        )}
        <div className="grid-2">
          <Field id="ns-data" label="Data e ora" error={errs.dataOra}>
            <input id="ns-data" className="input" type="datetime-local" value={dataOra} onChange={(e) => { setDataOra(e.target.value); clear('dataOra'); }} disabled={busy} aria-invalid={Boolean(errs.dataOra)} />
          </Field>
          <Field id="ns-durata" label="Durata (minuti)" error={errs.durata} hint="Serve per calcolare la frequenza dei partecipanti.">
            <input id="ns-durata" className="input" type="number" min={1} value={durata} onChange={(e) => { setDurata(e.target.value); clear('durata'); }} disabled={busy} placeholder="90" aria-invalid={Boolean(errs.durata)} />
          </Field>
        </div>
        <button type="submit" className="btn" disabled={busy}><Icon name="plus" /> {creando ? 'Creo…' : 'Pianifica sessione'}</button>
      </div>
    </form>
  );
}
