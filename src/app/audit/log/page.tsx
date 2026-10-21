import Link from 'next/link';
import type { Route } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import { requireAuditor } from '@/lib/auth-context';
import { ChainVerifyButton } from '@/components/ChainVerifyButton';
import { Icon, fmtIstante } from '@/components/admin/Atlante';
import { applicaFiltri, bytesToHex, filtriAttivi, filtriQueryString, parseFiltri } from '@/lib/audit-filtri';
import { EVENTI, GRUPPI, etichettaEvento, riassuntoEvento } from '@/lib/eventi-etichette';
import type { EventoRow } from '@/lib/db-types';
import { LogTable, type RigaLog } from './LogTable';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;

type Nome = { nome: string; cognome: string; email: string };

export default async function AuditLogPage(
  props: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  await requireAuditor();
  const supabase = await createSupabaseServerClient();
  const filtri = parseFiltri(searchParams ?? {});

  // Stream del tenant corrente.
  const { data: streamRpc } = await supabase.rpc('current_stream_id');
  const streamId = typeof streamRpc === 'string' ? streamRpc : null;

  // Eventi filtrati in SQL e paginati: pagina 1 = i più recenti (Blocco B #3:
  // il log può crescere a centinaia di migliaia di righe, mai caricarlo tutto).
  const conteggio = supabase.from('evento').select('id', { count: 'exact', head: true });
  applicaFiltri(conteggio, filtri);
  const { count } = await conteggio;
  const totale = count ?? 0;
  const pagine = Math.max(1, Math.ceil(totale / PAGE_SIZE));
  const richiesta = Number.parseInt(typeof searchParams?.pagina === 'string' ? searchParams.pagina : '', 10);
  const pagina = Number.isFinite(richiesta) && richiesta >= 1 ? Math.min(richiesta, pagine) : 1;
  const from = (pagina - 1) * PAGE_SIZE;
  const query = supabase
    .from('evento')
    .select('id, seq, event_type, occurred_at, actor, subject_type, subject_id, payload, prev_hash, hash');
  applicaFiltri(query, filtri);
  const eventi = unwrap(
    await query.order('seq', { ascending: false }).range(from, from + PAGE_SIZE - 1).returns<EventoRow[]>(),
    'il log eventi',
  );

  // Risoluzione degli pseudonimi al momento della lettura (anagrafica, corsi,
  // edizioni, contenuti, sessioni): il log resta pseudonimo, la vista no.
  const ids = (tipo: string) => Array.from(new Set(eventi.filter((e) => e.subject_type === tipo && e.subject_id).map((e) => e.subject_id as string)));
  const personaIds = new Set<string>(eventi.map((e) => e.actor?.persona_id).filter((x): x is string => typeof x === 'string'));
  for (const id of ids('persona')) personaIds.add(id);

  const [personeR, loR, corsiR, edizioniR, sessioniR, iscrizioniR, tuttePersoneR] = await Promise.all([
    personaIds.size ? supabase.from('persona').select('id, nome, cognome, email').in('id', Array.from(personaIds)) : Promise.resolve({ data: [] as { id: string; nome: string; cognome: string; email: string }[] }),
    ids('learning_object').length ? supabase.from('learning_object').select('id, titolo').in('id', ids('learning_object')) : Promise.resolve({ data: [] as { id: string; titolo: string }[] }),
    ids('corso').length ? supabase.from('corso').select('id, titolo').in('id', ids('corso')) : Promise.resolve({ data: [] as { id: string; titolo: string }[] }),
    ids('edizione').length ? supabase.from('edizione').select('id, codice, corso:corso_id ( titolo )').in('id', ids('edizione')).returns<{ id: string; codice: string; corso: { titolo: string } | null }[]>() : Promise.resolve({ data: [] as { id: string; codice: string; corso: { titolo: string } | null }[] }),
    ids('sessione').length ? supabase.from('sessione').select('id, titolo').in('id', ids('sessione')) : Promise.resolve({ data: [] as { id: string; titolo: string }[] }),
    ids('iscrizione').length ? supabase.from('iscrizione').select('id, persona:persona_id ( nome, cognome ), edizione:edizione_id ( codice )').in('id', ids('iscrizione')).returns<{ id: string; persona: { nome: string; cognome: string } | null; edizione: { codice: string } | null }[]>() : Promise.resolve({ data: [] as { id: string; persona: { nome: string; cognome: string } | null; edizione: { codice: string } | null }[] }),
    supabase.from('persona').select('id, nome, cognome').order('cognome').limit(500),
  ]);
  const personaById = new Map<string, Nome>((personeR.data ?? []).map((p) => [p.id, p]));
  const soggetti = new Map<string, string>();
  for (const l of loR.data ?? []) soggetti.set(`learning_object:${l.id}`, l.titolo);
  for (const c of corsiR.data ?? []) soggetti.set(`corso:${c.id}`, c.titolo);
  for (const e of edizioniR.data ?? []) soggetti.set(`edizione:${e.id}`, `${e.corso?.titolo ?? 'Corso'} · ${e.codice}`);
  for (const s of sessioniR.data ?? []) soggetti.set(`sessione:${s.id}`, s.titolo);
  for (const i of iscrizioniR.data ?? []) soggetti.set(`iscrizione:${i.id}`, `${i.persona ? `${i.persona.cognome} ${i.persona.nome}` : 'Iscrizione'}${i.edizione ? ` · ${i.edizione.codice}` : ''}`);
  for (const [id, p] of personaById) soggetti.set(`persona:${id}`, `${p.cognome} ${p.nome}`);
  const tuttePersone = (tuttePersoneR.data ?? []) as { id: string; nome: string; cognome: string }[];

  const righe: RigaLog[] = eventi.map((e) => {
    const pid = typeof e.actor?.persona_id === 'string' ? e.actor.persona_id : null;
    const p = pid ? personaById.get(pid) : undefined;
    return {
      id: e.id,
      seq: e.seq,
      tipo: e.event_type,
      etichetta: etichettaEvento(e.event_type),
      quando: fmtIstante(e.occurred_at),
      quandoIso: e.occurred_at,
      attore: { nome: p ? `${p.nome} ${p.cognome}` : null, email: p?.email ?? null, id: pid, tipo: e.actor?.type ?? null },
      soggetto: { tipo: e.subject_type, id: e.subject_id, etichetta: e.subject_id ? soggetti.get(`${e.subject_type}:${e.subject_id}`) ?? null : null },
      riassunto: riassuntoEvento(e.event_type, e.payload),
      payload: e.payload,
      actorRaw: e.actor,
      prevHash: bytesToHex(e.prev_hash),
      hash: bytesToHex(e.hash),
    };
  });

  const primoSeq = eventi[0]?.seq;
  const ultimoSeq = eventi[eventi.length - 1]?.seq;
  const href = (pg: number) => `/audit/log${filtriQueryString(filtri, { pagina: pg > 1 ? pg : null })}` as Route;
  const exportHref = `/api/audit/export${filtriQueryString(filtri)}`;

  return (
    <>
      <div className="page-head">
        <div className="page-head__lead">
          <span className="eyebrow">Area auditor</span>
          <h1>Registro degli eventi</h1>
          <p>
            Ogni azione rilevante è un evento scritto una volta per sempre e legato al precedente da un hash.
            Nel registro restano solo identificativi: i nomi che vedi qui sono risolti dall&apos;anagrafica al momento della lettura.
          </p>
        </div>
        <div className="page-head__actions">
          <a className="btn btn--secondary" href={exportHref} download>
            <Icon name="download" /> Esporta CSV{filtriAttivi(filtri) ? ' (filtrato)' : ''}
          </a>
        </div>
      </div>

      {streamId && <ChainVerifyButton streamId={streamId} />}

      <section className="card">
        <div className="card__head">
          <div>
            <h3>Eventi</h3>
            <div className="sub">{totale} event{totale === 1 ? 'o' : 'i'}{filtriAttivi(filtri) ? ' con i filtri attuali' : ' nel registro'} · dal più recente</div>
          </div>
        </div>
        <div className="card__body">
          <form method="get" className="log-filters" action="/audit/log">
            <div className="field field--inline">
              <label htmlFor="f-gruppo">Famiglia</label>
              <select id="f-gruppo" name="gruppo" className="select" defaultValue={filtri.gruppo ?? ''}>
                <option value="">Tutte</option>
                {GRUPPI.map((g) => <option key={g.id} value={g.id}>{g.etichetta}</option>)}
              </select>
            </div>
            <div className="field field--inline">
              <label htmlFor="f-tipo">Evento</label>
              <select id="f-tipo" name="tipo" className="select" defaultValue={filtri.tipo ?? ''}>
                <option value="">Tutti</option>
                {GRUPPI.map((g) => (
                  <optgroup key={g.id} label={g.etichetta}>
                    {EVENTI.filter((e) => e.gruppo === g.id).map((e) => <option key={e.tipo} value={e.tipo}>{e.etichetta}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="field field--inline">
              <label htmlFor="f-persona">Persona</label>
              <select id="f-persona" name="persona" className="select" defaultValue={filtri.persona ?? ''}>
                <option value="">Tutte</option>
                {tuttePersone.map((p) => <option key={p.id} value={p.id}>{p.cognome} {p.nome}</option>)}
              </select>
            </div>
            <div className="field field--inline">
              <label htmlFor="f-da">Dal</label>
              <input id="f-da" name="da" type="date" className="input" defaultValue={filtri.da ?? ''} />
            </div>
            <div className="field field--inline">
              <label htmlFor="f-a">Al</label>
              <input id="f-a" name="a" type="date" className="input" defaultValue={filtri.a ?? ''} />
            </div>
            <div className="log-filters__actions">
              <button type="submit" className="btn btn--sm">Applica</button>
              {filtriAttivi(filtri) && <Link className="btn btn--ghost btn--sm" href="/audit/log">Azzera</Link>}
            </div>
          </form>

          <LogTable righe={righe} />

          <nav className="pager" aria-label="Pagine del registro">
            <span className="pager__info">
              Pagina {pagina} di {pagine}
              {primoSeq != null && ultimoSeq != null ? ` · eventi ${ultimoSeq}–${primoSeq}` : ''}
            </span>
            {pagine > 1 && (
              <span className="pager__nav">
                {pagina > 1 ? <Link className="btn btn--ghost btn--xs" href={href(1)}>Più recenti</Link> : null}
                {pagina > 1 ? <Link className="btn btn--ghost btn--xs" href={href(pagina - 1)}>‹ Indietro</Link> : null}
                {pagina < pagine ? <Link className="btn btn--ghost btn--xs" href={href(pagina + 1)}>Avanti ›</Link> : null}
                {pagina < pagine ? <Link className="btn btn--ghost btn--xs" href={href(pagine)}>Più vecchi</Link> : null}
              </span>
            )}
          </nav>
        </div>
      </section>
    </>
  );
}
