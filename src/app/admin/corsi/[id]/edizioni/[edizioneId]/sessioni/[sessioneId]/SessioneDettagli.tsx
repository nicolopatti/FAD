'use client';

import { useState } from 'react';
import { INCARICO_RUOLO_LABEL, type IncaricoConPersona, type SessioneRow } from '@/lib/db-types';
import { Field } from '@/components/admin/Form';
import { useFeedback } from '@/components/ui/Feedback';
import { useCall } from '@/components/admin/useCall';
import { ErrorBanner } from '@/components/admin/ErrorBanner';
import type { Errori } from '@/lib/validazione';

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Dettagli modificabili della sessione: titolo, quando, durata, riunione, docente; annullamento. */
export function SessioneDettagli({ sessione, docenti }: { sessione: SessioneRow; docenti: IncaricoConPersona[] }) {
  const { confirm } = useFeedback();
  const { call, busy, error } = useCall();
  const annullata = Boolean(sessione.annullato_at);
  const [titolo, setTitolo] = useState(sessione.titolo);
  const [dataOra, setDataOra] = useState(toLocalInput(sessione.data_ora));
  const [durata, setDurata] = useState(sessione.durata_minuti != null ? String(sessione.durata_minuti) : '');
  const [meeting, setMeeting] = useState(sessione.vcs_meeting_id ?? '');
  const [incaricoId, setIncaricoId] = useState(sessione.incarico_id ?? '');
  const [errs, setErrs] = useState<Errori>({});
  const [salvando, setSalvando] = useState(false);

  const dirty = titolo.trim() !== sessione.titolo || dataOra !== toLocalInput(sessione.data_ora) || durata !== (sessione.durata_minuti != null ? String(sessione.durata_minuti) : '') || meeting !== (sessione.vcs_meeting_id ?? '') || incaricoId !== (sessione.incarico_id ?? '');
  const docenteMancante = sessione.incarico_id && !docenti.some((d) => d.id === sessione.incarico_id);

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    const ve: Errori = {};
    if (!titolo.trim()) ve.titolo = 'Indica un titolo.';
    if (durata.trim() && (!/^\d+$/.test(durata.trim()) || Number(durata) <= 0)) ve.durata = 'Minuti interi, es. 90.';
    if (dataOra && Number.isNaN(new Date(dataOra).getTime())) ve.dataOra = 'Data o ora non valide.';
    setErrs(ve);
    if (Object.keys(ve).length) return;
    try {
      await call('PATCH', `/api/admin/sessioni/${sessione.id}`, {
        titolo: titolo.trim(),
        data_ora: dataOra ? new Date(dataOra).toISOString() : null,
        durata_minuti: durata.trim() ? Number(durata) : null,
        ...(sessione.modalita === 'vcs' ? { vcs_meeting_id: meeting.trim() || null } : {}),
        incarico_id: incaricoId || null,
      }, { successo: 'Sessione aggiornata.', busy: setSalvando });
    } catch { /* banner */ }
  }

  async function annulla() {
    if (!(await confirm({ titolo: 'Annullare questa sessione?', messaggio: 'Resta nel registro come annullata e non conta per la frequenza. Non si può tornare indietro.', conferma: 'Annulla sessione', pericolosa: true }))) return;
    try { await call('PATCH', `/api/admin/sessioni/${sessione.id}`, { annulla: true }, { successo: 'Sessione annullata.' }); } catch { /* banner */ }
  }

  return (
    <form className="card" onSubmit={salva} noValidate>
      <div className="card__head">
        <div><h3>Dettagli</h3><div className="sub">Il docente si sceglie tra i docenti e tutor dell&apos;edizione.</div></div>
        {!annullata && <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={annulla}>Annulla sessione</button>}
      </div>
      <div className="card__body">
        <ErrorBanner error={error} />
        <div className="grid-2">
          <Field id="sd-titolo" label="Titolo" required error={errs.titolo}>
            <input id="sd-titolo" className="input" value={titolo} onChange={(e) => setTitolo(e.target.value)} disabled={busy || annullata} aria-invalid={Boolean(errs.titolo)} />
          </Field>
          <Field id="sd-docente" label="Docente" hint={docenti.length === 0 ? 'Nessun docente o tutor nell’edizione: si assegna nella scheda "Docenti e tutor".' : docenteMancante ? 'Il docente assegnato non è più tra gli incarichi.' : undefined}>
            <select id="sd-docente" className="select" value={incaricoId} onChange={(e) => setIncaricoId(e.target.value)} disabled={busy || annullata}>
              <option value="">— nessuno —</option>
              {docenti.map((d) => <option key={d.id} value={d.id}>{d.persona ? `${d.persona.cognome} ${d.persona.nome}` : d.persona_id} · {INCARICO_RUOLO_LABEL[d.ruolo]}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid-3">
          <Field id="sd-data" label="Data e ora" error={errs.dataOra}>
            <input id="sd-data" className="input" type="datetime-local" value={dataOra} onChange={(e) => setDataOra(e.target.value)} disabled={busy || annullata} aria-invalid={Boolean(errs.dataOra)} />
          </Field>
          <Field id="sd-durata" label="Durata (minuti)" error={errs.durata}>
            <input id="sd-durata" className="input" type="number" min={1} value={durata} onChange={(e) => setDurata(e.target.value)} disabled={busy || annullata} aria-invalid={Boolean(errs.durata)} />
          </Field>
          {sessione.modalita === 'vcs' && (
            <Field id="sd-meeting" label="ID riunione">
              <input id="sd-meeting" className="input mono" value={meeting} onChange={(e) => setMeeting(e.target.value)} disabled={busy || annullata} />
            </Field>
          )}
        </div>
        {!annullata && <button type="submit" className="btn" disabled={busy || !dirty}>{salvando ? 'Salvo…' : 'Salva modifiche'}</button>}
      </div>
    </form>
  );
}
