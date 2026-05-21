import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAuditor } from '@/lib/auth-context';
import { ChainVerifyButton } from '@/components/ChainVerifyButton';

export const dynamic = 'force-dynamic';

export default async function AuditLogPage() {
  await requireAuditor();
  const supabase = createSupabaseServerClient();

  // Stream del tenant corrente.
  const { data: stream } = await supabase.rpc('current_stream_id');
  const streamId = stream as string | null;

  // Eventi dello stream.
  const { data: eventi } = await supabase
    .from('evento')
    .select('id, seq, event_type, occurred_at, actor, subject_type, subject_id, payload, prev_hash, hash')
    .order('seq', { ascending: true });

  // Anagrafica per la risoluzione dei pseudonimi nella cronologia leggibile.
  const personaIds = Array.from(
    new Set(
      (eventi ?? [])
        .map((e) => (e.actor as { persona_id?: string } | null)?.persona_id)
        .filter(Boolean) as string[],
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

  // Idem per learning_object e iscrizione mostrate in cronologia.
  const loIds = Array.from(
    new Set(
      (eventi ?? [])
        .filter((e) => e.subject_type === 'learning_object')
        .map((e) => e.subject_id)
        .filter(Boolean) as string[],
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
        <table>
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
            {(eventi ?? []).map((e) => {
              const personaId = (e.actor as { persona_id?: string } | null)?.persona_id;
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
        </table>
      </section>

      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Stream grezzo (pseudonimo)</h2>
          {streamId && <ChainVerifyButton streamId={streamId} />}
        </div>
        <table>
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
            {(eventi ?? []).map((e) => (
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
                <td className="mono hash">{hexOf(e.prev_hash)}</td>
                <td className="mono hash">{hexOf(e.hash)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function hexOf(input: unknown): string {
  if (typeof input !== 'string') return '';
  // Supabase serializza bytea come stringa con prefisso "\x".
  return input.startsWith('\\x') ? input.slice(2) : input;
}
