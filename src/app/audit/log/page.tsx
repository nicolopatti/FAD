import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrap } from '@/lib/db-result';
import { requireAuditor } from '@/lib/auth-context';
import { ChainVerifyButton } from '@/components/ChainVerifyButton';
import type { EventoRow } from '@/lib/db-types';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 200;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams?: { pagina?: string };
}) {
  await requireAuditor();
  const supabase = createSupabaseServerClient();

  // Stream del tenant corrente.
  const { data: streamRpc } = await supabase.rpc('current_stream_id');
  const streamId = typeof streamRpc === 'string' ? streamRpc : null;

  // Eventi dello stream, PAGINATI per seq (200 per pagina; default: l'ultima
  // pagina, cioè gli eventi più recenti). Prima la pagina caricava l'intero
  // stream: a centinaia di migliaia di eventi non reggeva (Blocco B #3).
  const { count } = await supabase
    .from('evento')
    .select('id', { count: 'exact', head: true });
  const totale = count ?? 0;
  const pagine = Math.max(1, Math.ceil(totale / PAGE_SIZE));
  const richiesta = Number.parseInt(searchParams?.pagina ?? '', 10);
  const pagina = Number.isFinite(richiesta) && richiesta >= 1 ? Math.min(richiesta, pagine) : pagine;
  const from = (pagina - 1) * PAGE_SIZE;
  const eventi = unwrap(await supabase
    .from('evento')
    .select('id, seq, event_type, occurred_at, actor, subject_type, subject_id, payload, prev_hash, hash')
    .order('seq', { ascending: true })
    .range(from, from + PAGE_SIZE - 1)
    .returns<EventoRow[]>(), 'il log eventi');
  const primoSeq = eventi[0]?.seq;
  const ultimoSeq = eventi[eventi.length - 1]?.seq;
  const paginatore = (
    <nav className="muted" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <span>
        Pagina {pagina} di {pagine} · {totale} eventi
        {primoSeq != null && ultimoSeq != null ? ` · seq ${primoSeq}–${ultimoSeq}` : ''}
      </span>
      {pagina > 1 && <a href={`?pagina=1`}>« prima</a>}
      {pagina > 1 && <a href={`?pagina=${pagina - 1}`}>‹ precedenti</a>}
      {pagina < pagine && <a href={`?pagina=${pagina + 1}`}>successivi ›</a>}
      {pagina < pagine && <a href={`?pagina=${pagine}`}>ultima »</a>}
    </nav>
  );

  // Anagrafica per la risoluzione dei pseudonimi nella cronologia leggibile.
  const personaIds = Array.from(
    new Set(
      eventi
        .map((e) => e.actor?.persona_id)
        .filter((x): x is string => typeof x === 'string'),
    ),
  );
  const personaById = new Map<string, { nome: string; cognome: string; email: string }>();
  if (personaIds.length) {
    const { data: persone } = await supabase
      .from('persona')
      .select('id, nome, cognome, email')
      .in('id', personaIds);
    for (const p of persone ?? []) personaById.set(p.id, p);
  }

  // Idem per learning_object mostrati in cronologia.
  const loIds = Array.from(
    new Set(
      eventi
        .filter((e) => e.subject_type === 'learning_object')
        .map((e) => e.subject_id)
        .filter((x): x is string => typeof x === 'string'),
    ),
  );
  const loById = new Map<string, { titolo: string }>();
  if (loIds.length) {
    const { data: los } = await supabase
      .from('learning_object')
      .select('id, titolo')
      .in('id', loIds);
    for (const l of los ?? []) loById.set(l.id, l);
  }

  return (
    <>
      <h1>Log eventi</h1>
      <p className="muted">
        Due viste sullo stesso stream: la <strong>cronologia leggibile</strong>{' '}
        risolve gli pseudonimi via anagrafica al momento della lettura;
        lo <strong>stream grezzo</strong> mostra esattamente ciò che è scritto sul
        log e permette di verificare la catena.
      </p>

      <section className="card">
        <h2>Cronologia leggibile</h2>
        {paginatore}
        <div className="tbl-wrap"><table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Quando</th>
              <th>Chi</th>
              <th>Evento</th>
              <th>Oggetto</th>
              <th>Dettagli</th>
            </tr>
          </thead>
          <tbody>
            {eventi.map((e) => {
              const personaId = e.actor?.persona_id;
              const p = personaId ? personaById.get(personaId) : undefined;
              const lo =
                e.subject_type === 'learning_object' && e.subject_id
                  ? loById.get(e.subject_id)
                  : undefined;
              return (
                <tr key={e.id}>
                  <td className="mono">{e.seq}</td>
                  <td className="mono">{new Date(e.occurred_at).toISOString()}</td>
                  <td>
                    {p ? (
                      <>
                        {p.nome} {p.cognome}
                        <div className="muted">{p.email}</div>
                      </>
                    ) : (
                      <span className="muted mono">{personaId}</span>
                    )}
                  </td>
                  <td className="mono">{e.event_type}</td>
                  <td>
                    {lo ? lo.titolo : <span className="muted mono">{e.subject_type}</span>}
                  </td>
                  <td className="mono">
                    {Object.keys(e.payload ?? {}).length
                      ? JSON.stringify(e.payload)
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </section>

      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Stream grezzo (pseudonimo)</h2>
          {streamId && <ChainVerifyButton streamId={streamId} />}
        </div>
        {paginatore}
        <div className="tbl-wrap"><table className="tbl">
          <thead>
            <tr>
              <th>seq</th>
              <th>event_type</th>
              <th>actor</th>
              <th>subject</th>
              <th>payload</th>
              <th>prev_hash</th>
              <th>hash</th>
            </tr>
          </thead>
          <tbody>
            {eventi.map((e) => (
              <tr key={e.id}>
                <td className="mono">{e.seq}</td>
                <td className="mono">{e.event_type}</td>
                <td className="mono">{JSON.stringify(e.actor)}</td>
                <td className="mono">
                  {e.subject_type}/{e.subject_id ?? '—'}
                </td>
                <td className="mono">
                  {Object.keys(e.payload ?? {}).length ? JSON.stringify(e.payload) : '—'}
                </td>
                <td className="mono hash">{bytesToHex(e.prev_hash)}</td>
                <td className="mono hash">{bytesToHex(e.hash)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>
    </>
  );
}

function bytesToHex(input: unknown): string {
  if (typeof input !== 'string' || input.length === 0) return '';
  // Postgres "hex" output (psql, supabase test db): "\x" + hex.
  if (input.startsWith('\\x')) return input.slice(2);
  // PostgREST (Supabase REST API) serializza bytea come base64 in JSON:
  // lo riconvertiamo in hex per la lettura nel report di audit.
  try {
    const decoded = Buffer.from(input, 'base64');
    // Heuristica: hash sha256 = 32 byte. Se il decode non torna 32 byte,
    // probabilmente la stringa non era base64 → mostriamo l'originale.
    return decoded.length > 0 ? decoded.toString('hex') : input;
  } catch {
    return input;
  }
}
