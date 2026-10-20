'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { EdizioneConCorso, SessioneModalita, VcsPiattaforma } from '@/lib/db-types';
import { Icon } from '@/components/admin/Atlante';
import { Field } from '@/components/admin/Form';
import { useFeedback } from '@/components/ui/Feedback';
import type { Errori } from '@/lib/validazione';

export function NewSessioneForm({ edizioni }: { edizioni: EdizioneConCorso[] }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [edizioneId, setEdizioneId] = useState('');
  const [titolo, setTitolo] = useState('');
  const [modalita, setModalita] = useState<SessioneModalita>('vcs');
  const [piattaforma, setPiattaforma] = useState<VcsPiattaforma>('teams');
  const [meetingId, setMeetingId] = useState('');
  const [dataOra, setDataOra] = useState('');
  const [durata, setDurata] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errs, setErrs] = useState<Errori>({});

  function valida(): Errori {
    const e: Errori = {};
    if (!edizioneId) e.edizione = 'Scegli l\'edizione a cui appartiene la sessione.';
    if (!titolo.trim()) e.titolo = 'Indica un titolo, es. "Webinar modulo 1".';
    if (durata.trim() && (!/^\d+$/.test(durata.trim()) || Number(durata) <= 0)) e.durata = 'Minuti interi, es. 90.';
    if (dataOra && Number.isNaN(new Date(dataOra).getTime())) e.dataOra = 'Data o ora non valide.';
    return e;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const ve = valida();
    setErrs(ve);
    if (Object.keys(ve).length) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/sessioni', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          edizione_id: edizioneId,
          titolo: titolo.trim(),
          modalita,
          vcs_piattaforma: modalita === 'vcs' ? piattaforma : null,
          vcs_meeting_id: modalita === 'vcs' ? meetingId.trim() || null : null,
          data_ora: dataOra ? new Date(dataOra).toISOString() : null,
          durata_minuti: durata.trim() ? Number(durata) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast(`Sessione "${titolo.trim()}" pianificata.`);
      router.push(`/admin/sessioni/${json.sessione.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const clear = (k: string) => { if (errs[k]) setErrs({ ...errs, [k]: '' }); };

  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="card__head">
        <div className="section-step"><span className="step-num"><Icon name="plus" style={{ width: 14, height: 14 }} /></span><h3>Pianifica una sessione</h3></div>
      </div>
      <div className="card__body">
        {error && (
          <div className="banner banner--err"><Icon name="alert" className="banner__icon" /><div className="banner__body">{error}</div></div>
        )}

        {edizioni.length === 0 ? (
          <div className="empty">
            <Icon name="calendar" className="empty__icon" />
            <div className="empty__t">Nessuna edizione attiva</div>
            <div className="empty__s">Una sessione appartiene a un&apos;edizione: crea prima un corso con un&apos;edizione attiva.</div>
            <div className="empty__action"><Link className="btn" href="/admin/corsi">Vai ai corsi</Link></div>
          </div>
        ) : (
          <>
            <div className="grid-2">
              <Field id="ns-edizione" label="Edizione" required error={errs.edizione}>
                <select id="ns-edizione" className="select" value={edizioneId} onChange={(e) => { setEdizioneId(e.target.value); clear('edizione'); }} disabled={busy} aria-invalid={Boolean(errs.edizione)}>
                  <option value="">— scegli —</option>
                  {edizioni.map((ed) => (
                    <option key={ed.id} value={ed.id}>{ed.corso?.titolo ?? '(corso?)'} · {ed.codice}</option>
                  ))}
                </select>
              </Field>
              <Field id="ns-titolo" label="Titolo" required error={errs.titolo}>
                <input id="ns-titolo" className="input" value={titolo} onChange={(e) => { setTitolo(e.target.value); clear('titolo'); }} disabled={busy} placeholder="es. Webinar Modulo 1" aria-invalid={Boolean(errs.titolo)} />
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
              <Field id="ns-meeting" label="ID riunione" hint="Facoltativo: servirà all'import automatico delle presenze via API.">
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

            <div className="field__hint" style={{ marginBottom: 14 }}>
              Il docente è facoltativo e si assegna dopo: una sessione senza docente è comunque pianificabile.
            </div>

            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Creo…' : 'Pianifica sessione'}
            </button>
          </>
        )}
      </div>
    </form>
  );
}
