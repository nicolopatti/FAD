import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth-context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import { INCARICO_RUOLO_LABEL, type IncaricoRuolo, type PersonaRiepilogo } from '@/lib/db-types';
import { Crumb } from '@/components/AppShell';
import { Icon, fmtData } from '@/components/admin/Atlante';
import { PersonaForm } from './PersonaForm';

export const dynamic = 'force-dynamic';

type IscrJoin = {
  id: string; creato_il: string; piano_id: string | null;
  edizione: { id: string; codice: string; concluso_at: string | null; annullato_at: string | null; corso: { id: string; titolo: string } | null } | null;
  azienda: { ragione_sociale: string } | null;
  piano: { titolo: string } | null;
};
type IncJoin = { id: string; ruolo: IncaricoRuolo; edizione: { id: string; codice: string; corso: { id: string; titolo: string } | null } | null };
type AttMini = { id: string; numero: string; emesso_at: string; iscrizione_id: string; corso: { titolo: string } | null };

/** Scheda di una persona: anagrafica modificabile, accesso, iscrizioni, incarichi, attestati. */
export default async function PersonaPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { data: p } = await supabase.from('persona_riepilogo').select('*').eq('id', params.id).maybeSingle<PersonaRiepilogo>();
  if (!p) notFound();

  const [iscrizioni, incarichi, attestati] = await Promise.all([
    supabase.from('iscrizione').select('id, creato_il, piano_id, edizione:edizione_id ( id, codice, concluso_at, annullato_at, corso:corso_id ( id, titolo ) ), azienda:azienda_id ( ragione_sociale ), piano:piano_id ( titolo )').eq('persona_id', p.id).order('creato_il', { ascending: false }).returns<IscrJoin[]>().then((r) => unwrap(r, 'le iscrizioni')),
    supabase.from('incarico').select('id, ruolo, edizione:edizione_id ( id, codice, corso:corso_id ( id, titolo ) )').eq('persona_id', p.id).returns<IncJoin[]>().then((r) => unwrap(r, 'gli incarichi')),
    supabase.from('attestato').select('id, numero, emesso_at, iscrizione_id, corso:corso_id ( titolo )').eq('persona_id', p.id).is('sostituito_da', null).order('emesso_at', { ascending: false }).returns<AttMini[]>().then((r) => unwrap(r, 'gli attestati')),
  ]);

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <Crumb items={[{ label: 'Persone', href: '/admin/persone' }, { label: `${p.cognome} ${p.nome}` }]} />
          <h1>{p.cognome} {p.nome}</h1>
          <div className="head-chips">
            {p.accesso ? <span className="chip chip--ok">accesso attivo</span> : <span className="chip chip--ocra">da invitare</span>}
            {p.n_incarichi > 0 && <span className="chip chip--teal">docente/tutor</span>}
            <span>{p.email}</span>
            <span>· in anagrafica dal {fmtData(p.creato_il)}</span>
          </div>
        </div>
        <div className="page-head__actions">
          <Link className="btn btn--ghost" href="/admin/persone"><Icon name="arrowLeft" /> Persone</Link>
        </div>
      </div>

      <div className="grid-2-380">
        <div>
          <PersonaForm persona={p} />
          <div className="card">
            <div className="card__head"><div><h3>Iscrizioni</h3><div className="sub">Ogni riga apre l&apos;edizione.</div></div></div>
            <div className="card__body card__body--flush">
              {iscrizioni.length === 0 ? <div className="card__body"><div className="muted">Nessuna iscrizione.</div></div> : (
                <div className="tbl-wrap"><table className="tbl tbl--zebra">
                  <thead><tr><th>Corso</th><th>Edizione</th><th>Stato</th><th>Azienda</th><th>Piano</th><th>Iscritto il</th></tr></thead>
                  <tbody>
                    {iscrizioni.map((i) => {
                      const ed = i.edizione; const stato = !ed ? '—' : ed.annullato_at ? 'annullata' : ed.concluso_at ? 'conclusa' : 'attiva';
                      const href = ed?.corso ? (`/admin/corsi/${ed.corso.id}/edizioni/${ed.id}` as Route) : null;
                      return (
                        <tr key={i.id}>
                          <td className="t-title">{ed?.corso ? <Link className="t-link" href={`/admin/corsi/${ed.corso.id}` as Route}>{ed.corso.titolo}</Link> : '—'}</td>
                          <td>{href ? <Link className="t-link mono" href={href}>{ed!.codice}</Link> : <span className="mono">{ed?.codice ?? '—'}</span>}</td>
                          <td><span className={`chip ${stato === 'attiva' ? 'chip--ok' : stato === 'conclusa' ? 'chip--muted' : 'chip--err'}`}>{stato}</span></td>
                          <td className="muted">{i.azienda?.ragione_sociale ?? '—'}</td>
                          <td className="muted">{i.piano?.titolo ?? '—'}</td>
                          <td className="muted">{fmtData(i.creato_il)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              )}
            </div>
          </div>
        </div>
        <div>
          <div className="card">
            <div className="card__head"><h3>Attestati</h3></div>
            <div className="card__body">
              {attestati.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Nessun attestato valido.</div> : (
                <ul className="ready">
                  {attestati.map((a) => (
                    <li key={a.id} className="is-ok">
                      <span className="ready__dot"><Icon name="shield" /></span>
                      <span style={{ minWidth: 0 }}>
                        <a className="mono" href={`/api/attestati/${a.id}/pdf`} target="_blank" rel="noreferrer">n. {a.numero}</a>
                        <span className="muted"> · {a.corso?.titolo ?? 'corso'} · {fmtData(a.emesso_at)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="card">
            <div className="card__head"><h3>Incarichi</h3></div>
            <div className="card__body">
              {incarichi.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Nessun incarico come docente o tutor. Si assegna dalla scheda &quot;Docenti e tutor&quot; di un&apos;edizione.</div> : (
                <ul className="ready">
                  {incarichi.map((k) => (
                    <li key={k.id}>
                      <span className="ready__dot"><Icon name="users" /></span>
                      <span style={{ minWidth: 0 }}>
                        <span className="chip chip--teal">{INCARICO_RUOLO_LABEL[k.ruolo]}</span>{' '}
                        {k.edizione?.corso ? <Link href={`/admin/corsi/${k.edizione.corso.id}/edizioni/${k.edizione.id}/docenti` as Route}>{k.edizione.corso.titolo} · <span className="mono">{k.edizione.codice}</span></Link> : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
