'use client';

import { useMemo, useRef, useState } from 'react';
import type { PoliticaAttestato } from '@/lib/db-types';
import { parseDelimited } from '@/lib/csv';
import { useFeedback } from '@/components/ui/Feedback';
import { Icon, fmtData } from '@/components/admin/Atlante';
import { Field, Pager } from '@/components/admin/Form';
import { useCall, type CallFn } from '@/components/admin/useCall';
import { ErrorBanner } from '@/components/admin/ErrorBanner';
import { BulkBar } from '@/components/admin/Lista';
import { isEmail, isCodiceFiscale, type Errori } from '@/lib/validazione';
import { matchCol, type IscrittoRow, type PianoMini } from '../../../_components/shared';

const ISCRITTI_PER_PAGINA = 25;

/** Scheda "Iscritti" dell'edizione: elenco con accesso, piano, attestato; aggiunta manuale o da CSV. */
export function Iscritti({
  edizioneId,
  codice,
  attiva,
  iscritti,
  piani,
  politicaAttestato,
}: {
  edizioneId: string;
  codice: string;
  attiva: boolean;
  iscritti: IscrittoRow[];
  piani: PianoMini[];
  politicaAttestato: PoliticaAttestato;
}) {
  const { confirm, toast } = useFeedback();
  const { call, busy, error, setBusy } = useCall();
  const [mode, setMode] = useState<'manuale' | 'csv'>('manuale');
  const [q, setQ] = useState('');
  const [pagina, setPagina] = useState(1);
  const [aggiungi, setAggiungi] = useState(iscritti.length === 0 && attiva);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pianoBlocco, setPianoBlocco] = useState('');

  const filtrati = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return iscritti;
    return iscritti.filter((i) => `${i.cognome} ${i.nome} ${i.email} ${i.codice_fiscale ?? ''} ${i.azienda ?? ''} ${i.piano_titolo ?? ''}`.toLowerCase().includes(n));
  }, [iscritti, q]);
  const pagine = Math.max(1, Math.ceil(filtrati.length / ISCRITTI_PER_PAGINA));
  const paginaCorrente = Math.min(pagina, pagine);
  const visibili = filtrati.slice((paginaCorrente - 1) * ISCRITTI_PER_PAGINA, paginaCorrente * ISCRITTI_PER_PAGINA);
  const senzaAccesso = iscritti.filter((i) => !i.accesso).length;

  async function assegnaPiano(i: IscrittoRow, pianoId: string) {
    const piano = piani.find((p) => p.id === pianoId);
    await call('PATCH', `/api/admin/iscrizioni/${i.iscrizione_id}`, { piano_id: pianoId || null }, {
      successo: piano ? `${i.cognome} ${i.nome}: piano "${piano.titolo}" assegnato.` : `${i.cognome} ${i.nome}: nessun piano finanziato.`,
    }).catch(() => { /* banner */ });
  }

  async function invita(i: IscrittoRow) {
    if (!(await confirm({ titolo: `Inviare l'invito a ${i.cognome} ${i.nome}?`, messaggio: `Riceve all'indirizzo ${i.email} un'email con il link per scegliere la password ed entrare.`, conferma: 'Invia l\'invito' }))) return;
    await call('POST', `/api/admin/persone/${i.persona_id}/invita`, undefined, { successo: `Invito inviato a ${i.email}.` }).catch(() => { /* banner */ });
  }

  async function rimuovi(i: IscrittoRow) {
    if (!(await confirm({ titolo: `Rimuovere ${i.cognome} ${i.nome} dall'edizione?`, messaggio: 'La persona resta in anagrafica; viene tolta solo l\'iscrizione a questa edizione.', conferma: 'Rimuovi', pericolosa: true }))) return;
    await call('DELETE', `/api/admin/iscrizioni/${i.iscrizione_id}`, undefined, { successo: `${i.cognome} ${i.nome} rimosso dall'edizione.` }).catch(() => { /* banner */ });
  }

  const selezionati = iscritti.filter((i) => sel.has(i.iscrizione_id));
  const tuttiSel = visibili.length > 0 && visibili.every((i) => sel.has(i.iscrizione_id));
  function toggleSel(id: string) { setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function toggleTutti() { setSel((s) => { const n = new Set(s); if (tuttiSel) visibili.forEach((i) => n.delete(i.iscrizione_id)); else visibili.forEach((i) => n.add(i.iscrizione_id)); return n; }); }

  type EsitoBlocco = { fatti?: number; saltati?: { iscrizione_id: string; motivo: string }[] };
  /** Azione in blocco sui selezionati: una chiamata, l'esito dice cosa è stato fatto e cosa no. */
  async function inBlocco(azione: 'invita' | 'piano' | 'attestato' | 'rimuovi', extra: Record<string, unknown> = {}) {
    const n = selezionati.length;
    const testi = {
      invita: { t: `Inviare l'invito a ${n} iscritt${n === 1 ? 'o' : 'i'}?`, m: 'Ognuno riceve un\'email con il link per scegliere la password. Chi ha già un accesso viene saltato.', c: 'Invia gli inviti', ok: 'inviti inviati' },
      piano: { t: `Assegnare il piano a ${n} iscritt${n === 1 ? 'o' : 'i'}?`, m: extra.piano_id ? 'Il piano finanziato scelto sostituisce quello eventualmente già assegnato.' : 'Il piano finanziato viene tolto agli iscritti selezionati.', c: 'Assegna', ok: 'iscritti aggiornati' },
      attestato: { t: `Emettere l'attestato a ${n} iscritt${n === 1 ? 'o' : 'i'}?`, m: 'Viene emesso solo a chi risulta completato adesso e non ha già un attestato valido; gli altri vengono saltati con il motivo.', c: 'Emetti', ok: 'attestati emessi' },
      rimuovi: { t: `Rimuovere ${n} iscritt${n === 1 ? 'o' : 'i'} dall'edizione?`, m: 'Le persone restano in anagrafica; viene tolta solo l\'iscrizione a questa edizione.', c: 'Rimuovi', ok: 'iscritti rimossi' },
    }[azione];
    if (!(await confirm({ titolo: testi.t, messaggio: testi.m, conferma: testi.c, pericolosa: azione === 'rimuovi' }))) return;
    try {
      const r = (await call('POST', `/api/admin/edizioni/${edizioneId}/blocco`, { azione, iscrizione_ids: selezionati.map((i) => i.iscrizione_id), ...extra })) as EsitoBlocco;
      const fatti = r.fatti ?? 0;
      if (r.saltati?.length) {
        const primo = r.saltati[0]; const p = iscritti.find((i) => i.iscrizione_id === primo.iscrizione_id);
        toast(`${fatti} ${testi.ok}, ${r.saltati.length} saltat${r.saltati.length === 1 ? 'o' : 'i'}: ${p ? `${p.cognome} ${p.nome}` : 'iscrizione'} (${primo.motivo})`, fatti > 0 ? 'ok' : 'errore');
      } else toast(`${fatti} ${testi.ok}.`);
      setSel(new Set());
    } catch { /* banner */ }
  }

  const [riemetti, setRiemetti] = useState<{ iscrizione_id: string; motivazione: string } | null>(null);
  async function emettiAttestato(i: IscrittoRow) {
    if (i.attestato) { setRiemetti({ iscrizione_id: i.iscrizione_id, motivazione: '' }); return; }
    if (!(await confirm({ titolo: `Emettere l'attestato a ${i.cognome} ${i.nome}?`, messaggio: 'Viene emesso solo se il percorso risulta completato adesso. Il documento è numerato e non si modifica: un errore si corregge con una riemissione.', conferma: 'Emetti' }))) return;
    await call('POST', `/api/admin/iscrizioni/${i.iscrizione_id}/attestato`, {}, { successo: `Attestato emesso a ${i.cognome} ${i.nome}.` }).catch(() => { /* banner */ });
  }
  async function confermaRiemissione() {
    if (!riemetti) return;
    const mot = riemetti.motivazione.trim();
    if (!mot) return;
    const i = iscritti.find((x) => x.iscrizione_id === riemetti.iscrizione_id);
    try {
      await call('POST', `/api/admin/iscrizioni/${riemetti.iscrizione_id}/attestato`, { motivazione: mot }, { successo: `Nuovo attestato emesso${i ? ` a ${i.cognome} ${i.nome}` : ''}; il precedente risulta sostituito.` });
      setRiemetti(null);
    } catch { /* banner */ }
  }

  return (
    <>
      <ErrorBanner error={error} />
      <div className="card">
        <div className="card__head">
          <div>
            <h3>Iscritti</h3>
            <div className="sub">Le persone iscritte a questa edizione. Chi non ha ancora un accesso riceve con l&apos;invito l&apos;email per scegliere la password.</div>
          </div>
          <div className="row">
            {senzaAccesso > 0 && (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={busy}
                onClick={async () => {
                  if (!(await confirm({ titolo: `Inviare l'invito a ${senzaAccesso} iscritt${senzaAccesso === 1 ? 'o' : 'i'}?`, messaggio: 'Ognuno riceve un\'email con il link per scegliere la password. Chi ha già un accesso non viene toccato.', conferma: 'Invia gli inviti' }))) return;
                  const r = (await call('POST', `/api/admin/edizioni/${edizioneId}/invita`).catch(() => undefined)) as { inviati?: number; errori?: { email: string; errore: string }[] } | undefined;
                  if (!r) return;
                  if (r.errori?.length) toast(`${r.inviati ?? 0} inviti inviati, ${r.errori.length} non riusciti: ${r.errori[0].email} (${r.errori[0].errore})`, 'errore');
                  else toast(`${r.inviati ?? 0} invit${(r.inviati ?? 0) === 1 ? 'o inviato' : 'i inviati'}.`);
                }}
              >
                Invita {senzaAccesso} senza accesso
              </button>
            )}
            {attiva && !aggiungi && (
              <button type="button" className="btn btn--sm" disabled={busy} onClick={() => setAggiungi(true)}><Icon name="plus" /> Aggiungi iscritti</button>
            )}
          </div>
        </div>
        <div className="card__body">
          {iscritti.length === 0 ? (
            <div className="muted" style={{ marginBottom: 12, fontSize: 13 }}>Nessun iscritto su questa edizione.</div>
          ) : (
            <>
              {iscritti.length > 8 && (
                <div className="toolbar" style={{ marginBottom: 12 }}>
                  <div className="search">
                    <Icon name="search" />
                    <input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="Cerca per nome, email, codice fiscale, azienda…" aria-label="Cerca tra gli iscritti" />
                  </div>
                </div>
              )}
              <BulkBar n={selezionati.length} cosa={selezionati.length === 1 ? 'iscritto selezionato' : 'iscritti selezionati'} onAzzera={() => setSel(new Set())}>
                {selezionati.some((i) => !i.accesso) && <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={() => inBlocco('invita')}>Invita</button>}
                {piani.length > 0 && (
                  <span className="row" style={{ gap: 6 }}>
                    <select className="select select--sm" value={pianoBlocco} onChange={(e) => setPianoBlocco(e.target.value)} disabled={busy} aria-label="Piano da assegnare" style={{ width: 'auto' }}>
                      <option value="">— nessun piano —</option>
                      {piani.map((p) => <option key={p.id} value={p.id}>{p.titolo}</option>)}
                    </select>
                    <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={() => inBlocco('piano', { piano_id: pianoBlocco || null })}>Assegna piano</button>
                  </span>
                )}
                {politicaAttestato !== 'nessuna' && <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={() => inBlocco('attestato')} title="Solo a chi ha completato il percorso"><Icon name="shield" /> Emetti attestati</button>}
                <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={() => inBlocco('rimuovi')}><Icon name="trash" /> Rimuovi</button>
              </BulkBar>
              <div className="tbl-wrap"><table className="tbl tbl--zebra tbl--lista">
                <thead><tr><th className="t-check"><input type="checkbox" checked={tuttiSel} onChange={toggleTutti} aria-label="Seleziona tutti gli iscritti visibili" /></th><th>Cognome e nome</th><th>Email</th><th>Accesso</th><th>Codice fiscale</th><th>Azienda</th><th>Piano finanziato</th>{politicaAttestato !== 'nessuna' && <th>Attestato</th>}<th></th></tr></thead>
                <tbody>
                  {visibili.map((i) => (
                    <tr key={i.iscrizione_id} className={sel.has(i.iscrizione_id) ? 'is-selected' : ''}>
                      <td className="t-check"><input type="checkbox" checked={sel.has(i.iscrizione_id)} onChange={() => toggleSel(i.iscrizione_id)} aria-label={`Seleziona ${i.cognome} ${i.nome}`} /></td>
                      <td className="t-title">{i.cognome} {i.nome}</td>
                      <td className="muted">{i.email}</td>
                      <td>
                        {i.accesso ? (
                          <span className="chip chip--ok" title="Ha un utente attivo sulla piattaforma">attivo</span>
                        ) : (
                          <button type="button" className="btn btn--ghost btn--xs" disabled={busy} title="Manda l'email con il link per scegliere la password" onClick={() => invita(i)}>Invita</button>
                        )}
                      </td>
                      <td className="mono">{i.codice_fiscale ?? <span className="chip chip--err">assente</span>}</td>
                      <td>{i.azienda ?? <span className="muted">—</span>}</td>
                      <td>
                        {piani.length === 0 ? (
                          <span className="muted" title="Crea un piano in Rendicontazione">—</span>
                        ) : (
                          <select className="select select--sm" value={i.piano_id ?? ''} disabled={busy} aria-label={`Piano finanziato di ${i.cognome} ${i.nome}`} onChange={(e) => assegnaPiano(i, e.target.value)}>
                            <option value="">— nessuno —</option>
                            {piani.map((p) => <option key={p.id} value={p.id}>{p.titolo}{p.fondo ? ` (${p.fondo})` : ''}</option>)}
                          </select>
                        )}
                      </td>
                      {politicaAttestato !== 'nessuna' && (
                        <td>
                          {i.attestato ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                              <a className="mono" href={`/api/attestati/${i.attestato.id}/pdf`} target="_blank" rel="noreferrer" title="Apri il PDF">n. {i.attestato.numero}</a>
                              <span className="muted" style={{ fontSize: 11 }}>{fmtData(i.attestato.emesso_at)}</span>
                              <button type="button" className="btn btn--ghost btn--xs" disabled={busy} onClick={() => emettiAttestato(i)} title="Emette un nuovo attestato con i dati di adesso; il precedente resta come sostituito"><Icon name="edit" /> Riemetti</button>
                            </div>
                          ) : (
                            <button type="button" className="btn btn--ghost btn--xs" disabled={busy} onClick={() => emettiAttestato(i)}>Emetti</button>
                          )}
                        </td>
                      )}
                      <td>
                        <button type="button" className="icon-btn" title="Rimuovi iscritto" aria-label={`Rimuovi ${i.cognome} ${i.nome}`} disabled={busy} onClick={() => rimuovi(i)}>
                          <Icon name="trash" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {visibili.length === 0 && (
                    <tr><td colSpan={politicaAttestato !== 'nessuna' ? 9 : 8} className="muted">Nessun iscritto corrisponde a “{q}”.</td></tr>
                  )}
                </tbody>
              </table></div>
              {riemetti && (
                <form className="edit-form" style={{ margin: '10px 0 14px' }} onSubmit={(e) => { e.preventDefault(); confermaRiemissione(); }}>
                  <Field id="riem-mot" label="Motivazione della riemissione" required hint="Finisce nel registro insieme al numero del nuovo attestato; il precedente resta consultabile come sostituito.">
                    <input id="riem-mot" className="input" value={riemetti.motivazione} onChange={(e) => setRiemetti({ ...riemetti, motivazione: e.target.value })} disabled={busy} placeholder="es. cognome errato in anagrafica, ora corretto" autoFocus />
                  </Field>
                  <div className="row">
                    <button type="submit" className="btn btn--sm" disabled={busy || !riemetti.motivazione.trim()}>Emetti il nuovo attestato</button>
                    <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setRiemetti(null)}>Annulla</button>
                  </div>
                </form>
              )}
              <Pager page={paginaCorrente} pages={pagine} total={filtrati.length} perPage={ISCRITTI_PER_PAGINA} onChange={setPagina} cosa="iscritti" />
            </>
          )}
          {!attiva && (
            <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>L&apos;edizione non è attiva: non si aggiungono iscritti.</div>
          )}
        </div>
      </div>

      {attiva && aggiungi && (
        <div className="card">
          <div className="card__head">
            <div><h3>Aggiungi iscritti a {codice}</h3><div className="sub">Una persona alla volta, oppure un file Excel salvato come CSV.</div></div>
            <div className="row">
              <div className="seg">
                <button type="button" className={mode === 'manuale' ? 'is-active' : ''} onClick={() => setMode('manuale')}>Manuale</button>
                <button type="button" className={mode === 'csv' ? 'is-active' : ''} onClick={() => setMode('csv')}>Da Excel/CSV</button>
              </div>
              {iscritti.length > 0 && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAggiungi(false)}>Chiudi</button>}
            </div>
          </div>
          <div className="card__body">
            {mode === 'manuale' ? (
              <IscrittoManuale edizioneId={edizioneId} piani={piani} busy={busy} call={call} />
            ) : (
              <IscrittiCsv edizioneId={edizioneId} esistenti={iscritti} busy={busy} call={call} onBusy={setBusy} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function IscrittoManuale({ edizioneId, piani, busy, call }: { edizioneId: string; piani: PianoMini[]; busy: boolean; call: CallFn }) {
  const [cognome, setCognome] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [cf, setCf] = useState('');
  const [azienda, setAzienda] = useState('');
  const [pianoId, setPianoId] = useState('');
  const [dataNascita, setDataNascita] = useState('');
  const [luogoNascita, setLuogoNascita] = useState('');
  const [errs, setErrs] = useState<Errori>({});
  const [aggiungendo, setAggiungendo] = useState(false);

  function valida(): Errori {
    const e: Errori = {};
    if (!cognome.trim()) e.cognome = 'Il cognome è obbligatorio.';
    if (!nome.trim()) e.nome = 'Il nome è obbligatorio.';
    if (!email.trim()) e.email = 'L\'email è obbligatoria: serve per l\'accesso.';
    else if (!isEmail(email)) e.email = 'Controlla l\'indirizzo: non sembra un\'email valida.';
    if (cf.trim() && !isCodiceFiscale(cf)) e.cf = 'Il codice fiscale deve avere 16 caratteri nel formato previsto.';
    return e;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ve = valida();
    setErrs(ve);
    if (Object.keys(ve).length) return;
    try {
      await call('POST', `/api/admin/edizioni/${edizioneId}/iscritti`, {
        cognome: cognome.trim(), nome: nome.trim(), email: email.trim(),
        codice_fiscale: cf.trim().toUpperCase() || null, azienda: azienda.trim() || null,
        piano_id: pianoId || null,
        data_nascita: dataNascita || null, luogo_nascita: luogoNascita.trim() || null,
      }, { successo: `${cognome.trim()} ${nome.trim()} iscritto all'edizione.`, busy: setAggiungendo });
      setCognome(''); setNome(''); setEmail(''); setCf(''); setAzienda(''); setDataNascita(''); setLuogoNascita('');
    } catch { /* banner */ }
  }

  const clear = (k: string) => { if (errs[k]) setErrs({ ...errs, [k]: '' }); };

  return (
    <form onSubmit={submit} noValidate>
      <div className="grid-3">
        <Field id="isc-cognome" label="Cognome" required error={errs.cognome}>
          <input id="isc-cognome" className="input" value={cognome} onChange={(e) => { setCognome(e.target.value); clear('cognome'); }} disabled={busy} placeholder="es. Bianchi" autoComplete="off" aria-invalid={Boolean(errs.cognome)} />
        </Field>
        <Field id="isc-nome" label="Nome" required error={errs.nome}>
          <input id="isc-nome" className="input" value={nome} onChange={(e) => { setNome(e.target.value); clear('nome'); }} disabled={busy} placeholder="es. Marco" autoComplete="off" aria-invalid={Boolean(errs.nome)} />
        </Field>
        <Field id="isc-email" label="Email" required error={errs.email}>
          <input id="isc-email" className="input" type="email" value={email} onChange={(e) => { setEmail(e.target.value); clear('email'); }} disabled={busy} placeholder="nome@azienda.it" autoComplete="off" aria-invalid={Boolean(errs.email)} />
        </Field>
      </div>
      <div className="grid-3">
        <Field id="isc-cf" label="Codice fiscale" error={errs.cf} hint="Richiesto per la rendicontazione dei corsi finanziati.">
          <input id="isc-cf" className="input mono" value={cf} onChange={(e) => { setCf(e.target.value); clear('cf'); }} disabled={busy} placeholder="RSSMRC80A01H501X" autoComplete="off" aria-invalid={Boolean(errs.cf)} />
        </Field>
        <Field id="isc-azienda" label="Azienda">
          <input id="isc-azienda" className="input" value={azienda} onChange={(e) => setAzienda(e.target.value)} disabled={busy} placeholder="Ragione sociale" autoComplete="off" />
        </Field>
        <Field id="isc-piano" label="Piano finanziato" hint={piani.length === 0 ? 'Nessun piano: si crea in Rendicontazione.' : 'Resta selezionato per l’iscritto successivo.'}>
          <select id="isc-piano" className="select" value={pianoId} onChange={(e) => setPianoId(e.target.value)} disabled={busy || piani.length === 0}>
            <option value="">— nessuno —</option>
            {piani.map((p) => <option key={p.id} value={p.id}>{p.titolo}{p.fondo ? ` (${p.fondo})` : ''}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid-3">
        <Field id="isc-dn" label="Data di nascita" hint="Compare sull’attestato. Il discente può completarla dal profilo.">
          <input id="isc-dn" className="input" type="date" value={dataNascita} onChange={(e) => setDataNascita(e.target.value)} disabled={busy} />
        </Field>
        <Field id="isc-ln" label="Luogo di nascita">
          <input id="isc-ln" className="input" value={luogoNascita} onChange={(e) => setLuogoNascita(e.target.value)} disabled={busy} placeholder="es. Bergamo" autoComplete="off" />
        </Field>
      </div>
      <button type="submit" className="btn" disabled={busy}><Icon name="plus" /> {aggiungendo ? 'Aggiungo…' : 'Aggiungi iscritto'}</button>
    </form>
  );
}

type ImportIscrittoRow = {
  riga: number; cognome: string; nome: string; email: string; codice_fiscale: string; azienda: string; partita_iva: string; data_nascita: string; luogo_nascita: string;
  esito: 'nuovo' | 'duplicato' | 'errore'; motivo?: string;
};

function IscrittiCsv({ edizioneId, esistenti, busy, call, onBusy }: { edizioneId: string; esistenti: IscrittoRow[]; busy: boolean; call: CallFn; onBusy: (v: boolean) => void }) {
  const { toast } = useFeedback();
  const [rows, setRows] = useState<ImportIscrittoRow[]>([]);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const emails = useMemo(() => new Set(esistenti.map((i) => i.email.toLowerCase().trim()).filter(Boolean)), [esistenti]);
  const cfs = useMemo(() => new Set(esistenti.map((i) => i.codice_fiscale?.toLowerCase().trim()).filter(Boolean)), [esistenti]);

  function parse(text: string) {
    try {
      const { headers, rows: raw } = parseDelimited(text);
      const ci = {
        cognome: matchCol(headers, ['cognome', 'surname', 'last name']),
        nome: matchCol(headers, ['nome', 'name', 'first name']),
        email: matchCol(headers, ['email', 'e-mail', 'indirizzo email']),
        cf: matchCol(headers, ['codice fiscale', 'cf', 'codice_fiscale', 'fiscal code']),
        azienda: matchCol(headers, ['azienda', 'ragione sociale', 'company', 'datore']),
        piva: matchCol(headers, ['partita iva', 'p.iva', 'piva', 'partita_iva', 'vat']),
        dn: matchCol(headers, ['data di nascita', 'data nascita', 'nato il', 'birth date', 'data_nascita']),
        ln: matchCol(headers, ['luogo di nascita', 'luogo nascita', 'nato a', 'birth place', 'luogo_nascita']),
      };
      const seenEmail = new Set<string>();
      const seenCf = new Set<string>();
      const out: ImportIscrittoRow[] = raw.map((r, idx) => {
        const cognome = (ci.cognome >= 0 ? r[ci.cognome] : '')?.trim() ?? '';
        const nome = (ci.nome >= 0 ? r[ci.nome] : '')?.trim() ?? '';
        const email = (ci.email >= 0 ? r[ci.email] : '')?.trim() ?? '';
        const cf = (ci.cf >= 0 ? r[ci.cf] : '')?.trim() ?? '';
        const azienda = (ci.azienda >= 0 ? r[ci.azienda] : '')?.trim() ?? '';
        const partita_iva = (ci.piva >= 0 ? r[ci.piva] : '')?.trim() ?? '';
        const data_nascita = (ci.dn >= 0 ? r[ci.dn] : '')?.trim() ?? '';
        const luogo_nascita = (ci.ln >= 0 ? r[ci.ln] : '')?.trim() ?? '';
        let esito: ImportIscrittoRow['esito'] = 'nuovo';
        let motivo: string | undefined;
        const ek = email.toLowerCase(); const ck = cf.toLowerCase();
        if (!cognome || !nome || !email) { esito = 'errore'; motivo = 'cognome/nome/email mancanti'; }
        else if (!isEmail(email)) { esito = 'errore'; motivo = 'email non valida'; }
        else if (emails.has(ek) || (ck && cfs.has(ck)) || seenEmail.has(ek) || (ck && seenCf.has(ck))) { esito = 'duplicato'; motivo = 'già iscritto'; }
        if (esito === 'nuovo') { seenEmail.add(ek); if (ck) seenCf.add(ck); }
        return { riga: idx + 1, cognome, nome, email, codice_fiscale: cf, azienda, partita_iva, data_nascita, luogo_nascita, esito, motivo };
      });
      setRows(out);
    } catch (e) {
      setRows([]);
      toast(e instanceof Error ? e.message : String(e), 'errore');
    }
  }

  const importabili = rows.filter((r) => r.esito === 'nuovo');

  async function importa() {
    onBusy(true);
    try {
      const r = (await call('POST', `/api/admin/edizioni/${edizioneId}/iscritti/import`, {
        rows: importabili.map((r) => ({
          cognome: r.cognome, nome: r.nome, email: r.email,
          codice_fiscale: r.codice_fiscale || null, azienda: r.azienda || null, partita_iva: r.partita_iva || null,
          data_nascita: r.data_nascita || null, luogo_nascita: r.luogo_nascita || null,
        })),
      })) as { creati?: number; duplicati?: number; errori?: { riga: number; error: string }[] } | undefined;
      // Il riepilogo viene dalla risposta del server, non dall'anteprima: dice cosa è entrato davvero.
      const creati = r?.creati ?? 0;
      const altri = [r?.duplicati ? `${r.duplicati} già iscritt${r.duplicati === 1 ? 'o' : 'i'}` : '', r?.errori?.length ? `${r.errori.length} con errori (riga ${importabili[r.errori[0].riga - 1]?.riga ?? r.errori[0].riga}: ${r.errori[0].error})` : ''].filter(Boolean).join(', ');
      toast(`${creati} iscritt${creati === 1 ? 'o importato' : 'i importati'}${altri ? `; ${altri}` : ''}.`, r?.errori?.length && creati === 0 ? 'errore' : 'ok');
      setRows([]);
    } catch { /* banner */ } finally { onBusy(false); }
  }

  return (
    <>
      <div
        className={`dropzone ${over ? 'is-over' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) f.text().then(parse); }}
      >
        <Icon name="upload" className="dropzone__icon" />
        <div className="dropzone__t">Trascina qui un file .csv</div>
        <div className="dropzone__s">colonne: Cognome, Nome, Email, Codice fiscale, Azienda, Partita IVA, Data di nascita (gg/mm/aaaa), Luogo di nascita · da Excel: salva come CSV</div>
      </div>
      <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(parse); e.target.value = ''; }} />

      {rows.length > 0 && (
        <>
          <div className="import-preview">
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>#</th><th>Cognome e nome</th><th>Email</th><th>Esito</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.riga}>
                    <td className="mono">{r.riga}</td>
                    <td>{r.cognome} {r.nome}</td>
                    <td className="muted">{r.email || '—'}</td>
                    <td>
                      {r.esito === 'errore' ? <span className="chip chip--err">Errore · {r.motivo}</span>
                        : r.esito === 'duplicato' ? <span className="chip chip--muted">Duplicato · ignorato</span>
                        : <span className="chip chip--teal">Nuovo</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <button type="button" className="btn" disabled={busy || importabili.length === 0} onClick={importa}>
              Importa {importabili.length} {importabili.length === 1 ? 'iscritto' : 'iscritti'}
            </button>
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setRows([])}>Annulla</button>
          </div>
        </>
      )}
    </>
  );
}
