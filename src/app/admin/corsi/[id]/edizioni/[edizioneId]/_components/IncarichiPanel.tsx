'use client';

import { useEffect, useState } from 'react';
import { INCARICO_RUOLI, INCARICO_RUOLO_LABEL, RUOLI_DIDATTICI, type IncaricoConPersona, type IncaricoRuolo } from '@/lib/db-types';
import { Icon } from '@/components/admin/Atlante';
import { Field } from '@/components/admin/Form';
import { useFeedback } from '@/components/ui/Feedback';
import { useCall } from '@/components/admin/useCall';
import { ErrorBanner } from '@/components/admin/ErrorBanner';
import { isEmail, type Errori } from '@/lib/validazione';

export type PersonaScelta = { id: string; nome: string; cognome: string; email: string };

/** Scheda "Docenti e tutor" dell'edizione: incarichi (D30) con persona e ruolo; la persona si cerca sul server. */
export function IncarichiPanel({ edizioneId, attiva, incarichi, sessioniPerIncarico }: { edizioneId: string; attiva: boolean; incarichi: IncaricoConPersona[]; sessioniPerIncarico: Record<string, number> }) {
  const { confirm } = useFeedback();
  const { call, busy, error } = useCall();
  const [aggiungi, setAggiungi] = useState(incarichi.length === 0 && attiva);
  const [origine, setOrigine] = useState<'esistente' | 'nuova'>('esistente');
  const [q, setQ] = useState('');
  const [personaId, setPersonaId] = useState('');
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [email, setEmail] = useState('');
  const [ruolo, setRuolo] = useState<IncaricoRuolo>('docente');
  const [errs, setErrs] = useState<Errori>({});
  const [salvando, setSalvando] = useState(false);

  const [candidati, setCandidati] = useState<PersonaScelta[]>([]);
  const [troncato, setTroncato] = useState(false);
  // Ricerca sul server (GET /api/admin/persone/cerca): niente anagrafica intera nella pagina.
  useEffect(() => {
    if (!aggiungi || origine !== 'esistente') return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/persone/cerca?q=${encodeURIComponent(q.trim())}`);
        const json = await res.json();
        setCandidati(json.persone ?? []);
        setTroncato(Boolean(json.troncato));
      } catch { setCandidati([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, aggiungi, origine]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ve: Errori = {};
    if (origine === 'esistente') {
      if (!personaId) ve.persona = 'Scegli una persona dall’elenco.';
    } else {
      if (!nome.trim()) ve.nome = 'Il nome è obbligatorio.';
      if (!cognome.trim()) ve.cognome = 'Il cognome è obbligatorio.';
      if (!email.trim() || !isEmail(email)) ve.email = 'Serve un’email valida.';
    }
    setErrs(ve);
    if (Object.keys(ve).length) return;
    try {
      await call('POST', `/api/admin/edizioni/${edizioneId}/incarichi`, origine === 'esistente'
        ? { persona_id: personaId, ruolo }
        : { nome: nome.trim(), cognome: cognome.trim(), email: email.trim(), ruolo },
      { successo: `${INCARICO_RUOLO_LABEL[ruolo]} assegnato all'edizione.`, busy: setSalvando });
      setPersonaId(''); setQ(''); setNome(''); setCognome(''); setEmail('');
    } catch { /* banner */ }
  }

  async function rimuovi(i: IncaricoConPersona) {
    const nomeP = i.persona ? `${i.persona.cognome} ${i.persona.nome}` : 'questa persona';
    if (!(await confirm({ titolo: `Togliere ${nomeP} come ${INCARICO_RUOLO_LABEL[i.ruolo].toLowerCase()}?`, messaggio: 'La persona resta in anagrafica; viene tolto solo l\'incarico in questa edizione.', conferma: 'Togli', pericolosa: true }))) return;
    try { await call('DELETE', `/api/admin/incarichi/${i.id}`, undefined, { successo: 'Incarico tolto.' }); } catch { /* banner */ }
  }

  return (
    <>
      <ErrorBanner error={error} />
      <div className="card">
        <div className="card__head">
          <div><h3>Docenti e tutor</h3><div className="sub">Chi insegna o segue questa edizione. I docenti e i tutor si scelgono poi come docente di una sessione e compaiono nella rendicontazione.</div></div>
          {attiva && !aggiungi && <button type="button" className="btn btn--sm" onClick={() => setAggiungi(true)}><Icon name="plus" /> Assegna</button>}
        </div>
        <div className="card__body">
          {incarichi.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>Nessun docente o tutor assegnato.</div>
          ) : (
            <div className="tbl-wrap"><table className="tbl tbl--zebra">
              <thead><tr><th>Persona</th><th>Email</th><th>Ruolo</th><th>Sessioni</th><th></th></tr></thead>
              <tbody>
                {incarichi.map((i) => (
                  <tr key={i.id}>
                    <td className="t-title">{i.persona ? `${i.persona.cognome} ${i.persona.nome}` : <span className="muted">(persona non leggibile)</span>}</td>
                    <td className="muted">{i.persona?.email ?? '—'}</td>
                    <td><span className={`chip ${RUOLI_DIDATTICI.includes(i.ruolo) ? 'chip--teal' : 'chip--muted'}`}>{INCARICO_RUOLO_LABEL[i.ruolo]}</span></td>
                    <td className="muted">{sessioniPerIncarico[i.id] ?? 0}</td>
                    <td>
                      <button type="button" className="icon-btn" title="Togli incarico" aria-label="Togli incarico" disabled={busy} onClick={() => rimuovi(i)}><Icon name="trash" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      </div>

      {attiva && aggiungi && (
        <form className="card" onSubmit={submit} noValidate>
          <div className="card__head">
            <div><h3>Assegna un docente o tutor</h3><div className="sub">Una persona già in anagrafica oppure una nuova.</div></div>
            <div className="row">
              <div className="seg">
                <button type="button" className={origine === 'esistente' ? 'is-active' : ''} onClick={() => setOrigine('esistente')}>In anagrafica</button>
                <button type="button" className={origine === 'nuova' ? 'is-active' : ''} onClick={() => setOrigine('nuova')}>Persona nuova</button>
              </div>
              {incarichi.length > 0 && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAggiungi(false)}>Chiudi</button>}
            </div>
          </div>
          <div className="card__body">
            {origine === 'esistente' ? (
              <div className="grid-2">
                <Field id="inc-q" label="Cerca la persona" required error={errs.persona} hint={troncato ? 'Mostro i primi 30: affina la ricerca.' : candidati.length === 0 && q.trim() ? 'Nessuna persona trovata: aggiungila come persona nuova.' : undefined}>
                  <div className="search" style={{ marginBottom: 8 }}>
                    <Icon name="search" />
                    <input id="inc-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cognome, nome o email" disabled={busy} />
                  </div>
                  <select className="select" size={6} value={personaId} onChange={(e) => setPersonaId(e.target.value)} disabled={busy} aria-label="Persone" style={{ height: 'auto' }}>
                    {candidati.map((p) => <option key={p.id} value={p.id}>{p.cognome} {p.nome} · {p.email}</option>)}
                  </select>
                </Field>
                <Field id="inc-ruolo" label="Ruolo">
                  <select id="inc-ruolo" className="select" value={ruolo} onChange={(e) => setRuolo(e.target.value as IncaricoRuolo)} disabled={busy}>
                    {INCARICO_RUOLI.map((r) => <option key={r} value={r}>{INCARICO_RUOLO_LABEL[r]}</option>)}
                  </select>
                </Field>
              </div>
            ) : (
              <>
                <div className="grid-3">
                  <Field id="inc-cognome" label="Cognome" required error={errs.cognome}><input id="inc-cognome" className="input" value={cognome} onChange={(e) => setCognome(e.target.value)} disabled={busy} autoComplete="off" /></Field>
                  <Field id="inc-nome" label="Nome" required error={errs.nome}><input id="inc-nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} disabled={busy} autoComplete="off" /></Field>
                  <Field id="inc-email" label="Email" required error={errs.email}><input id="inc-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} autoComplete="off" /></Field>
                </div>
                <Field id="inc-ruolo2" label="Ruolo">
                  <select id="inc-ruolo2" className="select" value={ruolo} onChange={(e) => setRuolo(e.target.value as IncaricoRuolo)} disabled={busy} style={{ maxWidth: 320 }}>
                    {INCARICO_RUOLI.map((r) => <option key={r} value={r}>{INCARICO_RUOLO_LABEL[r]}</option>)}
                  </select>
                </Field>
              </>
            )}
            <button type="submit" className="btn" disabled={busy}><Icon name="plus" /> {salvando ? 'Assegno…' : 'Assegna'}</button>
          </div>
        </form>
      )}
    </>
  );
}
